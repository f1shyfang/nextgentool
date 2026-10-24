# Brand guide source

The website-derived brand guidelines and reusable kit are saved in:

- `output/pdf/NextGen-Ventures-Brand-Guidelines.pdf`
- `output/pdf/NextGen-Ventures-Brand-Kit.zip`

The ZIP contains the guide, four SVG logo variants, editable CSS/JSON tokens, and source references. Usage recommendations are distinguished from observed website styles.

To regenerate from the repository root using Python 3.12 or later:

```sh
python3 -m venv .venv-brand
.venv-brand/bin/pip install -r brand-kit-source/requirements.txt
.venv-brand/bin/python brand-kit-source/build_brand_guide.py
```

The generator uses the existing website assets and local fonts in `apps/web/public/assets/`. Temporary font conversions and visual QA renders belong in `tmp/pdfs/`, which is ignored. The extracted kit folder is generated alongside the PDF and ZIP and is also ignored to avoid committing duplicate artifacts.
