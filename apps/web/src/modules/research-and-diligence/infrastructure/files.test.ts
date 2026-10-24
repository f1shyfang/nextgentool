import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { createFileInspector, createPrivateStorage } from "./files";

const pdf = strToU8("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const docx = () =>
  zipSync({
    "[Content_Types].xml": strToU8(
      '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "word/document.xml": strToU8(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
    ),
  });
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), "research-storage-"));
  roots.push(root);
  return root;
}
async function scanner(reply = "stream: OK\0") {
  let uploaded = Buffer.alloc(0);
  const server = createServer((socket) => {
    let data = Buffer.alloc(0);
    let command = false;
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (!command) {
        if (data.length < 10) return;
        expect(data.subarray(0, 10).toString()).toBe("zINSTREAM\0");
        data = data.subarray(10);
        command = true;
      }
      while (data.length >= 4) {
        const length = data.readUInt32BE(0);
        if (data.length < length + 4) return;
        if (!length) {
          socket.end(reply);
          return;
        }
        uploaded = Buffer.concat([uploaded, data.subarray(4, length + 4)]);
        data = data.subarray(length + 4);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test scanner port");
  return {
    inspector: createFileInspector({
      clamavHost: "127.0.0.1",
      clamavPort: address.port,
    }),
    uploaded: () => uploaded,
    port: address.port,
    server,
  };
}

describe("private storage", () => {
  it("rejects storage paths served by Next.js", () => {
    expect(() => createPrivateStorage("public/research")).toThrow(
      "outside public",
    );
    expect(() => createPrivateStorage(".next/static/research")).toThrow(
      "outside public",
    );
  });
  it("persists immutable versions with private permissions and UUID-only paths", async () => {
    const root = await temporary();
    const storage = createPrivateStorage(join(root, "private"));
    const key = randomUUID();
    await storage.put(key, pdf);
    await expect(storage.put(key, pdf)).resolves.toBeUndefined();
    await expect(
      storage.put(key, strToU8("replacement")),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await createPrivateStorage(join(root, "private")).get(key)).toEqual(
      Buffer.from(pdf),
    );
    expect((await stat(join(root, "private"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, "private", key))).mode & 0o777).toBe(0o600);
    await writeFile(join(root, "private", ".upload-abandoned"), "partial");
    expect(await storage.keys()).toEqual([
      { key, modifiedAt: expect.any(Number) },
    ]);
    for (const bad of [
      "../escape",
      "../../escape",
      "bad",
      `${key}/../escape`,
    ]) {
      await expect(storage.put(bad, pdf)).rejects.toMatchObject({
        code: "invalid",
      });
      await expect(storage.get(bad)).rejects.toMatchObject({ code: "invalid" });
      await expect(storage.remove(bad)).rejects.toMatchObject({
        code: "invalid",
      });
    }
    await storage.remove(key);
    await storage.remove(key);
    expect(await storage.keys()).toEqual([]);
  });
  it("does not read symlink targets", async () => {
    const root = await temporary();
    const key = randomUUID();
    await writeFile(join(root, "secret"), "secret");
    await mkdir(join(root, "private"));
    await symlink(join(root, "secret"), join(root, "private", key));
    const storage = createPrivateStorage(join(root, "private"));
    await expect(storage.get(key)).rejects.toBeDefined();
    expect(await storage.keys()).toEqual([]);
    expect((await readFile(join(root, "secret"))).toString()).toBe("secret");
  });
});

describe("document inspection", () => {
  it("streams actual bytes through ClamAV and checksums PDF and DOCX", async () => {
    const clean = await scanner();
    expect(await clean.inspector.inspect("deck.PDF", pdf)).toEqual({
      mediaType: "application/pdf",
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(clean.uploaded()).toEqual(Buffer.from(pdf));
    expect(await clean.inspector.inspect("memo.docx", docx())).toMatchObject({
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });
  it("supports the conventional newline scanner response", async () => {
    const clean = await scanner("stream: OK\n");
    await expect(
      clean.inspector.inspect("deck.pdf", pdf),
    ).resolves.toMatchObject({ mediaType: "application/pdf" });
  });
  it("rejects malware and never treats scanner errors as clean", async () => {
    const infected = await scanner("stream: Win.Test.EICAR_HDB-1 FOUND\0");
    await expect(
      infected.inspector.inspect("deck.pdf", pdf),
    ).rejects.toMatchObject({
      code: "invalid",
      message: expect.stringContaining("Malware"),
    });
    const broken = await scanner("stream: ERROR\0");
    await expect(
      broken.inspector.inspect("deck.pdf", pdf),
    ).rejects.toMatchObject({ code: "unavailable" });
    const deceptive = await scanner("stream: OK\0garbage");
    await expect(
      deceptive.inspector.inspect("deck.pdf", pdf),
    ).rejects.toMatchObject({ code: "unavailable" });
    const offline = await scanner();
    await new Promise<void>((done) => offline.server.close(() => done()));
    await expect(
      offline.inspector.inspect("deck.pdf", pdf),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects unsupported magic, encryption, missing EOF and oversized uploads before scanning", async () => {
    const inspector = createFileInspector({
      clamavHost: "127.0.0.1",
      clamavPort: 1,
    });
    for (const [filename, bytes] of [
      ["deck.exe", pdf],
      ["deck.pdf", strToU8("fake %%EOF")],
      ["deck.pdf", strToU8("%PDF-1.7\n/Encrypt 1 0 R\n%%EOF")],
      ["deck.pdf", strToU8("%PDF-1.7\n/Encr#79pt 1 0 R\n%%EOF")],
      ["deck.pdf", strToU8("%PDF-1.7\nmissing trailer")],
      ["deck.pdf", new Uint8Array(25 * 1024 * 1024 + 1)],
      ["memo.docx", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0])],
      ["memo.docx", zipSync({ "not-docx.txt": strToU8("hello") })],
    ] as const)
      await expect(inspector.inspect(filename, bytes)).rejects.toMatchObject({
        code: "invalid",
      });
  });
  it("rejects archive bombs and encrypted ZIP entries before decompression", async () => {
    const inspector = createFileInspector({
      clamavHost: "127.0.0.1",
      clamavPort: 1,
    });
    for (const mode of ["size", "encryption", "forged-size"] as const) {
      const bytes = Buffer.from(docx());
      const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      if (mode === "size")
        bytes.writeUInt32LE(100 * 1024 * 1024 + 1, central + 24);
      else if (mode === "encryption") bytes.writeUInt16LE(1, central + 8);
      else bytes.writeUInt32LE(1, central + 24);
      await expect(inspector.inspect("memo.docx", bytes)).rejects.toMatchObject(
        { code: "invalid" },
      );
    }
  });
});
