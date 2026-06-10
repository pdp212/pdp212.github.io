#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  deploy.sh — NÚT DEPLOY TỰ ĐỘNG
#  Portfolio: pdp212.github.io
#
#  CÁCH SỬ DỤNG:
#    bash deploy.sh                    ← deploy bình thường
#    bash deploy.sh "Mô tả thay đổi"  ← deploy với commit message tùy chỉnh
#
#  KHI TOKEN HẾT HẠN:
#    Mở file .env, thay dòng GITHUB_TOKEN=... bằng token mới
#    Lấy token mới tại: https://github.com/settings/tokens/new
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Màu sắc terminal ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Banner ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}══════════════════════════════════════════${NC}"
echo -e "${CYAN}${BOLD}   🚀  PORTFOLIO AUTO-DEPLOY              ${NC}"
echo -e "${CYAN}${BOLD}   pdp212.github.io                       ${NC}"
echo -e "${CYAN}${BOLD}══════════════════════════════════════════${NC}"
echo ""

# ── Bước 1: Xác định thư mục gốc project ────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo -e "${CYAN}📁 Thư mục:${NC} $SCRIPT_DIR"

# ── Bước 2: Load token từ file .env ─────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ""
  echo -e "${RED}❌ Không tìm thấy file .env!${NC}"
  echo ""
  echo -e "${YELLOW}Hãy tạo file .env bằng cách:${NC}"
  echo -e "  1. Chạy lệnh:  ${BOLD}cp .env.example .env${NC}"
  echo -e "  2. Mở file .env, điền token GitHub vào dòng GITHUB_TOKEN="
  echo -e "  3. Lấy token tại: ${BOLD}https://github.com/settings/tokens/new${NC}"
  echo -e "     (Chọn quyền: ✅ repo)"
  echo ""
  exit 1
fi

# Đọc từng dòng từ .env, bỏ qua comment và dòng trống
while IFS='=' read -r key value; do
  # Bỏ qua dòng comment và dòng trống
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  # Trim khoảng trắng
  key="${key// /}"
  value="${value// /}"
  # Export biến
  export "$key=$value"
done < "$ENV_FILE"

# Kiểm tra các biến bắt buộc
if [[ -z "${GITHUB_TOKEN:-}" || "$GITHUB_TOKEN" == "ghp_your_token_here" || ${#GITHUB_TOKEN} -lt 20 ]]; then
  echo ""
  echo -e "${RED}❌ Token chưa được điền trong file .env!${NC}"
  echo -e "${YELLOW}Mở file .env và thay 'ghp_your_token_here' bằng token thật của bạn.${NC}"
  echo -e "Lấy token tại: ${BOLD}https://github.com/settings/tokens/new${NC}"
  echo ""
  exit 1
fi

GITHUB_USER="${GITHUB_USER:-pdp212}"
GITHUB_REPO="${GITHUB_REPO:-pdp212.github.io}"

echo -e "${CYAN}👤 GitHub User:${NC} $GITHUB_USER"
echo -e "${CYAN}📦 Repo:${NC}        $GITHUB_REPO"

# ── Bước 3: Xác minh token với GitHub API ───────────────────────────
echo ""
echo -e "${CYAN}🔑 Đang xác minh token...${NC}"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/user")

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo -e "${RED}❌ Token không hợp lệ hoặc đã hết hạn! (HTTP $HTTP_STATUS)${NC}"
  echo ""
  echo -e "${YELLOW}Hãy tạo token mới:${NC}"
  echo -e "  1. Truy cập: ${BOLD}https://github.com/settings/tokens/new${NC}"
  echo -e "  2. Chọn quyền: ✅ repo (full control)"
  echo -e "  3. Mở file .env, thay dòng GITHUB_TOKEN= bằng token mới"
  echo -e "  4. Chạy lại: bash deploy.sh"
  echo ""
  exit 1
fi

echo -e "${GREEN}✅ Token hợp lệ!${NC}"

# ── Bước 4: Cập nhật remote URL với token mới ───────────────────────
REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

# Xóa remote cũ và thêm lại với token mới
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE_URL"

# ── Bước 5: Kiểm tra có thay đổi không ──────────────────────────────
echo ""
echo -e "${CYAN}📋 Kiểm tra thay đổi...${NC}"

# Thêm tất cả file (trừ những file trong .gitignore)
git add -A

# Kiểm tra có gì để commit không
if git diff --cached --quiet; then
  echo -e "${YELLOW}ℹ️  Không có thay đổi mới. Trang web đã ở phiên bản mới nhất.${NC}"
  echo ""
  echo -e "${GREEN}🌐 URL live:${NC} ${BOLD}https://${GITHUB_USER}.github.io${NC}"
  echo ""
  exit 0
fi

# ── Bước 6: Hiện danh sách file thay đổi ───────────────────────────
echo -e "${CYAN}📝 Các file sẽ được cập nhật:${NC}"
git diff --cached --name-status | while read -r status file; do
  case "$status" in
    A) echo -e "   ${GREEN}+ Thêm mới:${NC}  $file" ;;
    M) echo -e "   ${YELLOW}~ Sửa đổi:${NC}  $file" ;;
    D) echo -e "   ${RED}- Xóa bỏ:${NC}   $file" ;;
    *) echo -e "   ? $status: $file" ;;
  esac
done

# ── Bước 7: Tạo commit message ──────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

if [[ -n "${1:-}" ]]; then
  # Dùng message tùy chỉnh từ tham số đầu vào
  COMMIT_MSG="$1 [$TIMESTAMP]"
else
  # Tự tạo message dựa trên file thay đổi
  CHANGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  COMMIT_MSG="update: cập nhật $CHANGED_COUNT file(s) [$TIMESTAMP]"
fi

echo ""
echo -e "${CYAN}💬 Commit message:${NC} $COMMIT_MSG"

# ── Bước 8: Commit ───────────────────────────────────────────────────
git commit -m "$COMMIT_MSG"

# ── Bước 9: Push lên GitHub ──────────────────────────────────────────
echo ""
echo -e "${CYAN}☁️  Đang upload lên GitHub...${NC}"

git push origin main

# ── Bước 10: Hoàn tất ───────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✅  DEPLOY THÀNH CÔNG!                 ${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}🌐 Trang web của bạn:${NC}"
echo -e "   ${BOLD}https://${GITHUB_USER}.github.io${NC}"
echo ""
echo -e "${YELLOW}⏱️  GitHub Pages cần ~1-3 phút để cập nhật.${NC}"
echo -e "${YELLOW}   Nhấn Ctrl+Shift+R trong browser để làm mới cache.${NC}"
echo ""
