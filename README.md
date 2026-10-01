# 🎬 Phan Đức Phát — Portfolio Website (v2 Architecture)

<div align="center">

**🌐 Live:** [pdp212.github.io](https://pdp212.github.io) &nbsp;·&nbsp; **📦 Repo:** [github.com/pdp212/pdp212.github.io](https://github.com/pdp212/pdp212.github.io)

*Professional Video Editor & Camera Operator | Motion Designer*

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

</div>

---

## 📖 Giới thiệu

Đây là mã nguồn trang Portfolio cá nhân chính thức của **Phan Đức Phát**, được thiết kế theo phong cách **Cinematic Brutalism & Editorial** với bảng màu tối cao cấp (#000000, vàng gold #C5A880, monochrome contrast).

Dự án được xây dựng hoàn toàn bằng **Vanilla JavaScript (ES Modules / Functional Architecture), HTML5, và Vanilla CSS**, không dùng framework nặng, đạt điểm tối đa về hiệu năng và trải nghiệm tương tác.

---

## 📂 Kiến trúc thư mục (Target Architecture)

```text
github-portfolio/
│
├── .agents/                    # Custom agent rules & skills
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions tự động deploy Pages
│
├── assets/                     # Media & tĩnh
│   ├── images/
│   │   ├── profile/
│   │   ├── projects/
│   │   └── ui/
│   ├── videos/
│   │   ├── showreel/
│   │   ├── projects/
│   │   └── previews/
│   ├── transitions/            # CINEMATIC VIDEO TRANSITION ASSETS
│   │   ├── intro.mp4           # 2.0-3.0s mandatory initial load opening
│   │   ├── home-to-work.mp4    # 1.0-1.5s HOME → WORK transition
│   │   ├── work-to-profile.mp4 # 1.0-1.5s WORK → PROFILE transition
│   │   ├── profile-to-contact.mp4 # 1.0-1.5s PROFILE → CONTACT transition
│   │   └── contact-to-home.mp4 # 1.0-1.5s CONTACT → HOME transition
│   └── icon/
│
├── data/                       # CONTENT LAYER
│   ├── profile.js              # Thông tin cá nhân & showreel
│   ├── projects.js             # Danh mục dự án chi tiết (schema full)
│   ├── about.js                # Tiểu sử, kỹ năng & học vấn
│   ├── contact.js              # Thông tin liên lạc & mạng xã hội
│   └── index.js                # Aggregator documentation
│
├── src/                        # APPLICATION CORE
│   ├── app.js                  # Entry point (render sequence & page reveal)
│   │
│   ├── pages/                  # 4-PAGE SPA VIEWS
│   │   ├── home.js             # #home view render
│   │   ├── work.js             # #work view render
│   │   ├── profile.js          # #profile view render
│   │   └── contact.js          # #contact view render
│   │
│   ├── render/                 # Render components
│   │   ├── hero.js
│   │   └── ai.js
│   │
│   ├── interactions/           # UX & Micro-interactions
│   │   ├── videoTransitions.js # Video-based cinematic transition engine
│   │   ├── transitions.js      # CSS shutter fallback & entrance choreography
│   │   ├── navigation.js       # 4-page router, hashchange & mobile menu
│   │   ├── scroll.js           # Skill bar telemetry & viewport observers
│   │   ├── lightbox.js         # Editorial modal, focus trap & media viewer
│   │   ├── cursor.js           # Ambient cursor glow
│   │   └── animations.js       # Typewriter effect & slogan
│   │
│   └── utils/                  # Reusable utilities
│       ├── dom.js              # DOM selection, markdown parser, SVG helpers
│       ├── media.js            # Video embed & lazy loading
│       └── accessibility.js    # Focus trap & prefers-reduced-motion
│
├── scripts/                    # AUTOMATION & TOOLS
│   ├── validate.js             # Bộ kiểm tra tính toàn vẹn (Integrity audit)
│   ├── test_transitions.js     # End-to-end automation test cho video transitions
│   └── test_coccoc_video.js    # Cross-browser verification suite cho Cốc Cốc
│
├── effects/                    # CINEMATIC VISUAL EFFECTS
│   └── effects.js              # Live timecode clock, camera crosshair, jitter hover
│
├── index.html                  # Semantic HTML5 shell (#pageTransitionVideo overlay)
├── style.css                   # Design System & Responsive Styles (Strictly Roboto)
├── package.json                # Project manifest & NPM scripts
├── deploy.sh                   # Script deploy nhanh qua GitHub API
├── .env.example                # File mẫu cấu hình biến môi trường
├── .gitignore                  # Bảo mật token và dependencies
└── README.md
```

---

## 🎬 Hệ thống Video Transition — "Static Hold Handoff" Model (Strategy B)

Trang web sử dụng kiến trúc **Pre-rendered Cinematic Video (MP4 / H.264)** kết hợp cùng **Page Entrance Choreography** theo mô hình **Static Hold Handoff**:
1. **Khái niệm Static Hold Frame**:
   - Phần cuối của mỗi video chuyển cảnh được thiết kế có chủ đích với các khung hình tĩnh (**Static Final Frame**).
   - Khung hình tĩnh này không phải là thời gian chết (dead time), mà được dùng để che giấu khoảnh khắc hoán đổi DOM và cho phép hoạt ảnh entrance của trang đích bắt đầu chạy ngầm bên dưới khung hình tĩnh.
2. **Luồng thực thi**:
   - `TRANG HIỆN TẠI` → Bắt đầu phát video chuyển cảnh (`opacity: 1`, `visibility: visible`)
   - Khi video đạt đến đoạn Static Hold (`video.currentTime >= video.duration - holdDuration`):
     - Kích hoạt trang đích trong DOM
     - `window.scrollTo(0, 0)`
     - Kích hoạt hoạt cảnh entrance của trang đích (`.enter-home`, `.enter-work`, `.enter-profile`, `.enter-contact`)
   - Video tiếp tục giữ khung hình tĩnh với `opacity: 1`
   - Khi video kết thúc (`video.ended`):
     - Ẩn ngay lập tức lớp video overlay (cắt sắc nét, không crossfade, không fade mờ, không tạo khoảng đen trống)
     - Trang đích hiển thị ngay lập tức khi đã chạy được một phần hoạt cảnh entrance.
3. **Cấu hình thời gian (`holdDuration`)**:
   - `intro`: `holdDuration: 0.0`
   - `home-to-work`: `holdDuration: 0.30`
   - `work-to-profile`: `holdDuration: 0.30`
   - `profile-to-contact`: `holdDuration: 0.30`
   - `contact-to-home`: `holdDuration: 0.30`
4. **Transition Lock & Fallback**:
   - `isTransitioning = true` trong suốt thời gian phát video, ngăn chặn double-click / giật layout.
   - Cơ chế Fallback an toàn: nếu thiếu file video, hệ thống tự động chạy transition nhẹ mà không bao giờ treo web.

---

## 🎨 Design System & Constraints

Tuân thủ nghiêm ngặt **Design Rule Book** (`.agents/rules/portfolio-design.md`):

- **Background**: `#000000` hoặc `#050505`
- **Primary Text**: `#FFFFFF`
- **Secondary Text**: `rgba(255, 255, 255, 0.5)`
- **Accent Color**: `#C5A880` (Gold chuẩn điện ảnh)
- **Typography**: **CHỈ SỬ DỤNG ROBOTO** (300, 400, 500, 700, 900). Tuyệt đối không dùng Playfair Display, Inter hay các display font khác.
- **Corners**: `border-radius: 0` (hoặc tối đa `1px`), không card bo tròn kiểu SaaS.
- **Cinematic Interactions**:
  - **Filmstrip**: Bố cục khung hình và nhãn `REC [24FPS] · 4K`.
  - **Ticker**: Dải chạy ngang vô tận (infinite horizontal ticker).
  - **Scanlines**: Hiệu ứng đường quét tinh tế trên khối video/visual.
  - **Image Hover**: Mặc định `grayscale(100%)` → hover chuyển sang `grayscale(0%)`.

---

## 🛠 Lệnh kiểm tra & phát triển

```bash
# Kiểm tra toàn bộ tính toàn vẹn (file paths, design rules, fonts, security):
node scripts/validate.js

# Hoặc dùng npm:
npm run validate

# Chạy server thử nghiệm cục bộ:
npm run start
```
