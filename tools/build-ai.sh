#!/usr/bin/env bash
# Cài runtime thị trường/PDF; nguồn BCTC cần được cấu hình và kiểm chứng riêng.
set -euo pipefail
# Chẩn đoán staging: không dùng khóa hoặc đọc body giá.
python3 tools/probe-dnse-network.py
node tools/check-scripts.cjs
python3 -m venv .venv-ai
.venv-ai/bin/python -m pip install --disable-pip-version-check -r server/ai/requirements.txt
.venv-ai/bin/python -c "from vnstock import Market, Reference; from pypdf import PdfReader; print('Runtime thi truong/PDF san sang; BCTC can nguon da kiem chung')"
