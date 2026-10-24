import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  unlink,
} from "node:fs/promises";
import { createConnection } from "node:net";
import { join, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  type FileInspector,
  type PrivateStorage,
  ResearchError,
} from "../domain/types";

const MAX_UPLOAD = 25 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message: string): never => {
  throw new ResearchError("invalid", message);
};

export function createPrivateStorage(root: string): PrivateStorage {
  const directory = resolve(root);
  if (
    directory.split(sep).some((part) => part === "public" || part === ".next")
  ) {
    throw new ResearchError(
      "unavailable",
      "Private research storage must be outside public and Next.js output directories.",
    );
  }
  const path = (key: string) => {
    if (!uuid.test(key)) invalid("Invalid private storage key.");
    return join(directory, key);
  };
  const prepare = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new ResearchError(
        "unavailable",
        "Invalid private storage directory.",
      );
    await chmod(directory, 0o700);
  };
  return {
    async put(key, bytes) {
      const destination = path(key);
      await prepare();
      const temporary = join(directory, `.upload-${randomUUID()}`);
      const file = await open(
        temporary,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await file.writeFile(bytes);
        await file.sync();
        await file.close();
        // A hard link publishes the complete file atomically without replacing a version.
        try {
          await link(temporary, destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const existing = await open(
            destination,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            const info = await existing.stat();
            if (
              !info.isFile() ||
              info.size !== bytes.length ||
              !(await existing.readFile()).equals(Buffer.from(bytes))
            )
              invalid("Stored document versions are immutable.");
          } finally {
            await existing.close();
          }
        }
      } finally {
        await file.close();
        await unlink(temporary).catch(() => {});
      }
    },
    async get(key) {
      const destination = path(key);
      await prepare();
      const file = await open(
        destination,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        if (!(await file.stat()).isFile())
          throw new ResearchError("unavailable", "Invalid stored file.");
        return await file.readFile();
      } finally {
        await file.close();
      }
    },
    async remove(key) {
      const destination = path(key);
      await prepare();
      await unlink(destination).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    },
    async keys() {
      await prepare();
      const result: { key: string; modifiedAt: number }[] = [];
      for (const key of await readdir(directory)) {
        if (!uuid.test(key)) continue;
        const stat = await lstat(path(key)).catch(() => null);
        if (stat?.isFile() && !stat.isSymbolicLink())
          result.push({ key, modifiedAt: stat.mtimeMs });
      }
      return result;
    },
  };
}

function validateDocx(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  // Find the end-of-central-directory, including legal ZIP comments.
  let end = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (
      buffer.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + buffer.readUInt16LE(i + 20) === buffer.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) invalid("The DOCX archive is malformed.");
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  let cursor = buffer.readUInt32LE(end + 16);
  if (
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6) ||
    buffer.readUInt16LE(end + 8) !== count ||
    count === 0xffff ||
    cursor + centralSize !== end ||
    count > 4096
  )
    invalid("Unsupported DOCX archive.");
  let expanded = 0;
  const names = new Set<string>();
  const xml: Record<string, string> = {};
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50)
      invalid("The DOCX archive is malformed.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    const local = buffer.readUInt32LE(cursor + 42);
    if (
      next > end ||
      flags & 1 ||
      (method !== 0 && method !== 8) ||
      buffer.readUInt16LE(cursor + 34) ||
      local + 30 > buffer.readUInt32LE(end + 16) ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      invalid("Encrypted or malformed DOCX files are not supported.");
    const localNameLength = buffer.readUInt16LE(local + 26);
    const localExtraLength = buffer.readUInt16LE(local + 28);
    const localData = local + 30 + localNameLength + localExtraLength;
    if (
      localData + compressed > buffer.readUInt32LE(end + 16) ||
      buffer.readUInt16LE(local + 6) !== flags ||
      buffer.readUInt16LE(local + 8) !== method ||
      !buffer
        .subarray(local + 30, local + 30 + localNameLength)
        .equals(buffer.subarray(cursor + 46, cursor + 46 + nameLength))
    )
      invalid("Inconsistent DOCX archive entries.");
    if (expanded + size > MAX_EXPANDED)
      invalid("The expanded DOCX exceeds 100 MiB.");
    // Validate and consume the same bounded entries; a second ZIP parser could
    // select a different directory hidden in an archive comment.
    try {
      const compressedBytes = buffer.subarray(
        localData,
        localData + compressed,
      );
      const actual =
        method === 0
          ? compressedBytes
          : inflateRawSync(compressedBytes, {
              maxOutputLength: Math.min(size + 1, MAX_EXPANDED + 1),
            });
      if (actual.length !== size)
        invalid("DOCX archive sizes do not match its contents.");
      const entryName = buffer.toString(
        "utf8",
        cursor + 46,
        cursor + 46 + nameLength,
      );
      if (
        entryName === "[Content_Types].xml" ||
        entryName === "word/document.xml"
      )
        xml[entryName] = actual.toString("utf8");
    } catch (error) {
      if (error instanceof ResearchError) throw error;
      invalid("Invalid or excessively expanded DOCX content.");
    }
    expanded += size;
    if (expanded > MAX_EXPANDED) invalid("The expanded DOCX exceeds 100 MiB.");
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (
      names.has(name) ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..")
    )
      invalid("Invalid DOCX archive paths.");
    names.add(name);
    cursor = next;
  }
  if (
    cursor !== end ||
    !names.has("[Content_Types].xml") ||
    !names.has("word/document.xml")
  )
    invalid("The file is not a DOCX document.");
  try {
    const contentTypes = xml["[Content_Types].xml"];
    const document = xml["word/document.xml"];
    if (
      !contentTypes.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      ) ||
      !contentTypes.includes("/word/document.xml") ||
      !/<(?:\w+:)?document[\s>]/.test(document)
    )
      invalid("The file is not a DOCX document.");
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    invalid("The DOCX archive cannot be read.");
  }
}

function scan(bytes: Uint8Array, host: string, port: number): Promise<void> {
  return new Promise((resolveScan, reject) => {
    const socket = createConnection({ host, port });
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error?: ResearchError) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolveScan();
    };
    const unavailable = () =>
      finish(
        new ResearchError(
          "unavailable",
          "Malware scanning is unavailable. Please retry later.",
        ),
      );
    const deadline = setTimeout(unavailable, 15000);
    socket.on("error", unavailable);
    socket.on("end", () => {
      if (!settled) unavailable();
    });
    socket.on("data", (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      if (response.length > 4096) {
        unavailable();
        return;
      }
      const text = response.toString("utf8");
      if (!text.includes("\0") && !text.includes("\n")) return;
      if (/^stream: OK(?:\0|\r?\n)$/.test(text)) finish();
      else if (/^stream: [^\r\n\0]+ FOUND(?:\0|\r?\n)$/.test(text))
        finish(
          new ResearchError(
            "invalid",
            "Malware was detected in this document.",
          ),
        );
      else unavailable();
    });
    socket.on("connect", async () => {
      try {
        const write = (chunk: Uint8Array | string) =>
          new Promise<void>((done, fail) => {
            socket.write(chunk, (error) => (error ? fail(error) : done()));
          });
        await write("zINSTREAM\0");
        for (
          let offset = 0;
          offset < bytes.length && !settled;
          offset += 65536
        ) {
          const chunk = bytes.subarray(offset, offset + 65536);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          await write(size);
          await write(chunk);
        }
        if (!settled) await write(Buffer.alloc(4));
      } catch {
        unavailable();
      }
    });
  });
}

export function createFileInspector(options: {
  clamavHost: string;
  clamavPort: number;
}): FileInspector {
  return {
    async inspect(filename, bytes) {
      if (!bytes.length || bytes.length > MAX_UPLOAD)
        invalid("Upload a PDF or DOCX of up to 25 MiB.");
      let mediaType: string;
      if (/\.pdf$/i.test(filename)) {
        const buffer = Buffer.from(bytes);
        if (
          !/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(
            buffer.subarray(0, 9).toString("latin1"),
          ) ||
          !/%%EOF\s*$/.test(
            buffer
              .subarray(Math.max(0, bytes.length - 1024))
              .toString("latin1"),
          )
        )
          invalid("The file is not a valid PDF.");
        if (
          /\/Encrypt\b/.test(
            buffer
              .toString("latin1")
              .replace(/#([0-9a-f]{2})/gi, (_, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              ),
          )
        )
          invalid("Password-protected PDFs are not supported.");
        mediaType = "application/pdf";
      } else if (/\.docx$/i.test(filename)) {
        validateDocx(bytes);
        mediaType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else return invalid("Only PDF and DOCX documents are supported.");
      await scan(bytes, options.clamavHost, options.clamavPort);
      return {
        mediaType,
        checksum: createHash("sha256").update(bytes).digest("hex"),
      };
    },
  };
}
