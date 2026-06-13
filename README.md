# PHAN ĐỨC PHÁT — Portfolio Website

<div align="center">

**🌐 Live:** [pdp212.github.io](https://pdp212.github.io)
&nbsp;·&nbsp;
**📦 Repo:** [github.com/pdp212/pdp212.github.io](https://github.com/pdp212/pdp212.github.io)

*Professional Video Editor & Cameraman | Motion Designer*

</div>

---

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Kiến trúc kỹ thuật](#3-kiến-trúc-kỹ-thuật)
4. [Hướng dẫn tùy chỉnh nội dung](#4-hướng-dẫn-tùy-chỉnh-nội-dung)
5. [Hướng dẫn thêm ảnh & video](#5-hướng-dẫn-thêm-ảnh--video)
6. [Hướng dẫn deploy](#6-hướng-dẫn-deploy)
7. [Khi token GitHub hết hạn](#7-khi-token-github-hết-hạn)
8. [Câu hỏi thường gặp](#8-câu-hỏi-thường-gặp)

---

## 1. Giới thiệu

Trang Portfolio Single-Page theo phong cách **Editorial / High-Fashion** và **Điện ảnh Cổ điển**.

### Tính năng nổi bật
- ✅ **Data-driven**: Toàn bộ nội dung quản lý tập trung tại `data.js`
- ✅ **One-file edit**: Chỉ sửa 1 file là cập nhật toàn bộ trang web
- ✅ **Auto-deploy**: Script deploy tự động, 1 lệnh duy nhất
- ✅ **Lightbox**: Click vào dự án → xem chi tiết / video ngay tại chỗ
- ✅ **Responsive**: Tương thích mobile, tablet, desktop
- ✅ **SEO-ready**: Meta tags, Open Graph, structured HTML
- ✅ **Accessible**: ARIA labels, keyboard navigation, focus management

### Design System
| Token | Giá trị | Ý nghĩa |
|-------|---------|---------|
| Background | `#121212` | Đen mờ sâu |
| Primary Text | `#F5F5F7` | Trắng ngà |
| Secondary | `#8E8E93` | Xám tinh tế |
| Accent | `#C5A880` | Vàng Champagne |
| Fonts | Playfair Display + Inter | Serif + Sans |

---

## 2. Cấu trúc thư mục

```
github-portfolio/
│
├── 📄 data.js              ← ⭐ FILE DUY NHẤT CẦN SỬA để cập nhật nội dung
├── 📄 index.html           ← Khung HTML (shell) — ít khi cần sửa
├── 📄 script.js            ← Engine render + tương tác — không cần sửa
├── 📄 style.css            ← Design system — sửa khi đổi màu/font
│
├── 📄 deploy.sh            ← 🚀 Script deploy tự động (1 lệnh)
├── 📄 .env                 ← 🔑 Chứa GitHub Token (KHÔNG push lên GitHub)
├── 📄 .env.example         ← Mẫu để tạo file .env khi lấy token mới
├── 📄 .gitignore           ← Bảo vệ file .env không bị public
│
└── 📁 assets/
    ├── 📁 images/
    │   ├── 📁 projects/    ← Ảnh thumbnail cho từng dự án
    │   │   └── README.txt  ← Hướng dẫn đặt ảnh
    │   └── 📁 profile/     ← Ảnh chân dung / avatar
    │       └── README.txt
    └── 📁 videos/          ← Video cục bộ (nếu không dùng YouTube)
        └── README.txt
```

> **Quy tắc vàng:** Chỉ cần sửa `data.js` → chạy `bash deploy.sh` → xong!

---

## 3. Kiến trúc kỹ thuật

```
┌─────────────────────────────────────────────────────┐
│                    TRÌNH DUYỆT                      │
│                                                     │
│  index.html (Shell)                                 │
│  ┌───────────────────────────────────────────────┐  │
│  │  <div id="heroNameLine1"></div>  ← trống      │  │
│  │  <div id="projectsGrid"></div>   ← trống      │  │
│  │  <div id="contactInfo"></div>    ← trống      │  │
│  └───────────────────────────────────────────────┘  │
│           ↑ script.js đọc data.js và điền vào       │
│                                                     │
│  data.js (Dữ liệu)    script.js (Engine)            │
│  ┌──────────────┐      ┌─────────────────────────┐  │
│  │ PORTFOLIO_   │ ───→ │ renderHero()            │  │
│  │ DATA = {     │      │ renderShowreel()        │  │
│  │  profile,   │      │ renderProjects()        │  │
│  │  showreel,  │      │ renderAbout()           │  │
│  │  projects,  │      │ renderContact()         │  │
│  │  about,     │      │ + Lightbox, Animations  │  │
│  │  contact    │      │ + Scroll, Navbar        │  │
│  │ }           │      └─────────────────────────┘  │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

---

## 4. Hướng dẫn tùy chỉnh nội dung

> Mở file [`data.js`](data.js) — tất cả nội dung đều có comment tiếng Việt giải thích.

### 4.1 Thay đổi thông tin cá nhân

```js
// Trong data.js → phần profile:
profile: {
  fullName:  'PHAN ĐỨC PHÁT',          // ← Sửa tên tại đây
  nameLine1: 'PHAN',                    // ← Dòng 1 trên hero (chữ đặc)
  nameLine2: 'ĐỨC PHÁT',               // ← Dòng 2 trên hero (chữ rỗng)
  role:      'Video Editor & ...',      // ← Vai trò
  slogan:    '"Cinematic vision..."',   // ← Slogan (typewriter effect)
  workplace: 'Silver Swallows Studio',  // ← Nơi làm việc
  location:  'Hải Châu, Đà Nẵng',     // ← Địa điểm
},
```

### 4.2 Nhúng Showreel Video (YouTube/Vimeo)

```js
// Trong data.js → phần showreel:
showreel: {
  // Bước 1: Vào YouTube → video của bạn → Share → Embed
  // Bước 2: Copy phần ID trong link: youtube.com/embed/[VIDEO_ID]
  embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',  // ← Thay bằng ID thật

  // Nếu dùng Vimeo:
  // embedUrl: 'https://player.vimeo.com/video/123456789',
},
```

### 4.3 Thêm / sửa dự án mới

```js
// Trong data.js → phần projects → thêm vào cuối mảng:
{
  id:           'ten-du-an-khong-dau',    // ← ID duy nhất (không dấu, không cách)
  title:        'Tên Dự Án',             // ← Tên hiển thị
  category:     'Phân loại',             // ← VD: 'Cinematography', 'Motion Design'
  desc:         'Mô tả chi tiết...',     // ← Hiện trong lightbox khi click
  tags:         'Tag1 · Tag2 · Tag3',    // ← Kỹ thuật sử dụng
  size:         'large',                 // ← 'large' | 'medium' | 'small'
  thumbnail:    'assets/images/projects/ten-du-an.jpg',  // ← Ảnh thumbnail
  embedUrl:     null,                    // ← Link YouTube/Vimeo (null nếu không có)
  linkBehance:  'https://www.behance.net/...',  // ← Link Behance
  gradientClass:'pv-gradient-1',         // ← Màu nền (1-5) khi chưa có ảnh
},
```

**Quy tắc kích thước card:**
| `size` | Chiếm bao nhiêu? | Dùng khi nào? |
|--------|-----------------|---------------|
| `large` | 7/12 cột | Dự án nổi bật nhất |
| `medium` | 5/12 cột | Dự án quan trọng |
| `small` | 4/12 cột | Dự án phụ / nhiều dự án |

### 4.4 Cập nhật kỹ năng

```js
// Trong data.js → phần about:
skills: [
  'Adobe Premiere Pro',    // ← Thêm hoặc xóa kỹ năng tại đây
  'After Effects',
  // ...
],

skillBars: [
  { label: 'Cinematography & Camera', level: 92 },  // ← level: 0-100 (%)
  // ...
],
```

### 4.5 Cập nhật thông tin liên hệ

```js
// Trong data.js → phần contact:
contact: {
  email:    'your-email@gmail.com',      // ← Email
  phone:    '0796649266',               // ← Số điện thoại (10 chữ số)
  location: 'Hải Châu, Đà Nẵng',
  socials: {
    linkedin: 'https://www.linkedin.com/in/...',
    behance:  'https://www.behance.net/...',
  },
},
```

---

## 5. Hướng dẫn thêm ảnh & video

### 5.1 Thêm ảnh thumbnail cho dự án

**Bước 1:** Chuẩn bị ảnh
- Kích thước: **1280 × 720px** (tỷ lệ 16:9)
- Dung lượng: **< 500KB** (dùng [squoosh.app](https://squoosh.app) để nén)
- Định dạng: `.jpg` hoặc `.webp`

**Bước 2:** Đặt ảnh vào thư mục đúng
```
assets/images/projects/ten-du-an.jpg
```

**Bước 3:** Cập nhật `data.js`
```js
thumbnail: 'assets/images/projects/ten-du-an.jpg',
```

### 5.2 Thêm ảnh profile / avatar

**Bước 1:** Chuẩn bị ảnh — 800×800px, < 300KB, định dạng `.jpg`

**Bước 2:** Đặt vào:
```
assets/images/profile/avatar.jpg
```

**Bước 3:** Thêm vào `data.js` → phần `about`:
```js
about: {
  avatar: 'assets/images/profile/avatar.jpg',  // ← thêm dòng này
  // ...
}
```

*(Tính năng hiển thị avatar cần thêm vào `script.js` nếu muốn dùng)*

### 5.3 Nhúng video vào lightbox (khi click dự án)

```js
// Trong data.js → dự án cụ thể:
{
  embedUrl: 'https://www.youtube.com/embed/VIDEO_ID',
  // Khi click vào card này, lightbox sẽ play video thay vì hiện ảnh
}
```

---

## 6. Hướng dẫn deploy

### 6.1 Deploy lần đầu / bình thường

```bash
# Mở Terminal, vào thư mục project
cd /Users/sss-phat/Documents/github-portfolio

# Chạy deploy (1 lệnh duy nhất!)
bash deploy.sh
```

### 6.2 Deploy với mô tả tùy chỉnh

```bash
bash deploy.sh "Thêm dự án mới: TVC Đà Nẵng 2024"
```

### 6.3 Quy trình deploy thực hiện tự động

Script sẽ tự động:
1. ✅ Kiểm tra token hợp lệ
2. ✅ Phát hiện file nào đã thay đổi
3. ✅ Tạo commit với timestamp
4. ✅ Push lên GitHub
5. ✅ Thông báo URL live

---

## 7. Khi token GitHub hết hạn

Token GitHub có thể hết hạn (7 ngày, 30 ngày hoặc 1 năm tùy cài đặt).  
Khi hết hạn, script sẽ báo lỗi đỏ. Làm theo các bước sau:

### Bước 1 — Tạo token mới
Truy cập: **https://github.com/settings/tokens/new**

Cài đặt token:
- **Note:** `portfolio-deploy` (hoặc tên bất kỳ)
- **Expiration:** Chọn `90 days` hoặc `No expiration`
- **Scopes:** Tích chọn ✅ `repo` (full control of private repositories)

Click **"Generate token"** → Copy token (bắt đầu bằng `ghp_...`)

### Bước 2 — Cập nhật file .env

Mở file `.env` trong thư mục project:

```bash
# Dùng TextEdit, VS Code, hoặc bất kỳ text editor nào
open -e /Users/sss-phat/Documents/github-portfolio/.env
```

Thay dòng cũ:
```
GITHUB_TOKEN=ghp_token_cu_da_het_han
```

Bằng token mới:
```
GITHUB_TOKEN=ghp_token_moi_vua_tao
```

Lưu file.

### Bước 3 — Chạy lại deploy

```bash
bash deploy.sh
```

> ⚠️ **Bảo mật:** File `.env` được bảo vệ bởi `.gitignore` — token KHÔNG bao giờ bị push lên GitHub.

---

## 8. Câu hỏi thường gặp

### ❓ Sửa `data.js` xong nhưng trang web chưa cập nhật?

→ Chưa deploy! Chạy lệnh:
```bash
bash deploy.sh
```
→ Sau khi deploy, chờ 1-3 phút rồi nhấn **Ctrl+Shift+R** (Windows/Linux) hoặc **Cmd+Shift+R** (Mac) để xóa cache.

---

### ❓ Script báo lỗi "Token không hợp lệ"?

→ Token đã hết hạn. Xem [Bước 7](#7-khi-token-github-hết-hạn) để tạo token mới.

---

### ❓ Muốn thêm dự án nhưng không có ảnh thumbnail?

→ Để trống `thumbnail: null` — hệ thống sẽ tự hiển thị màu gradient đẹp thay thế.

---

### ❓ Video YouTube embed không hoạt động?

→ Đảm bảo dùng link dạng `embed`, không phải link xem thường:
```
❌ https://www.youtube.com/watch?v=VIDEO_ID
✅ https://www.youtube.com/embed/VIDEO_ID
```

---

### ❓ Muốn đổi màu accent (màu vàng)?

→ Mở `style.css`, tìm dòng:
```css
--accent: #C5A880;
```
Đổi thành màu bạn muốn (dùng [coolors.co](https://coolors.co) để chọn màu).

---

### ❓ Muốn thêm mục menu mới?

→ Mở `index.html`, thêm vào trong thẻ `<ul class="nav-links">`:
```html
<li><a href="#ten-section" class="nav-link">Tên Menu</a></li>
```
Và thêm section tương ứng trong HTML.

---

## Thông tin liên hệ

| Kênh | Link |
|------|------|
| 📧 Email | phanducphat2310@gmail.com |
| 📞 Hotline | 0796 649 266 |
| 💼 LinkedIn | [linkedin.com/in/phanducphat23](https://www.linkedin.com/in/phanducphat23) |
| 🎨 Behance | [behance.net/pdp23](https://www.behance.net/pdp23) |

---

<div align="center">

*"Cinematic vision. Technical precision. Elevating every frame."*

**© 2024 Phan Đức Phát — All rights reserved**

</div>
