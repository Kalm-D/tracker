#!/usr/bin/env bash
# Cài môi trường BCTC riêng; build lỗi thì Render giữ bản đang chạy.
set -euo pipefail
node tools/check-scripts.cjs
python3 -m venv .venv-ai
.venv-ai/bin/python -m pip install --disable-pip-version-check -r server/ai/requirements.txt
.venv-ai/bin/python -c "from vnstock import Finance; from pypdf import PdfReader; print('BCTC/PDF dependencies ready')"
