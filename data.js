/**
 * ════════════════════════════════════════════════════════════════════
 *  data.js — FILE DỮ LIỆU TRUNG TÂM
 *  Portfolio: Phan Đức Phát | pdp212.github.io
 *
 *  ĐÂY LÀ FILE DUY NHẤT BẠN CẦN CHỈNH SỬA để cập nhật nội dung.
 *  Mọi thay đổi ở đây sẽ tự động phản ánh lên toàn bộ trang web.
 * ════════════════════════════════════════════════════════════════════
 */

const PORTFOLIO_DATA = {

  // ──────────────────────────────────────────────────────────────────
  // 1. THÔNG TIN CÁ NHÂN CƠ BẢN
  //    → Chỉnh sửa tên, vai trò, slogan, nơi làm việc tại đây
  // ──────────────────────────────────────────────────────────────────
  profile: {
    // Họ và tên đầy đủ (viết HOA để hiển thị đúng trên hero)
    fullName: 'PHAN DUC PHAT',

    // Tên hiển thị chia làm 2 dòng trên hero lớn
    // Dòng 1: phần chữ đặc (solid white)
    nameLine1: 'PHAN DUC',
    // Dòng 2: phần chữ rỗng (stroke outline)
    nameLine2: 'PHAT',

    // Vai trò / chức danh nghề nghiệp
    role: 'Professional Video Editor & Cameraman | Motion Designer',

    // Câu slogan cá nhân (hiện thị dưới dạng hiệu ứng typewriter)
    slogan: '"Cinematic vision. Technical precision. Elevating every frame."',

    // Nơi làm việc hiện tại
    workplace: 'Freelancer',

    // Địa điểm sinh sống / làm việc
    location: 'Hải Châu, Đà Nẵng, Vietnam',

    // Chữ trang trí dọc bên phải hero (dạng vertical text)
    heroVertText: 'PRODUCTION SPECIALIST',
  },

  // ──────────────────────────────────────────────────────────────────
  // 2. SHOWREEL VIDEO
  //    → Thay đổi link YouTube/Vimeo tại đây để nhúng video thực
  //    → Để null nếu chưa có video (hiện placeholder)
  // ──────────────────────────────────────────────────────────────────
  showreel: {
    // Dán link YouTube embed vào đây khi bạn có showreel
    // Ví dụ YouTube: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
    // Ví dụ Vimeo:   'https://player.vimeo.com/video/123456789'
    // Để null = hiển thị placeholder đẹp
    embedUrl: null,

    // Tiêu đề hiển thị trên placeholder (khi chưa có video)
    placeholderTitle: 'SHOWREEL 2024',

    // Mô tả ngắn trên placeholder
    placeholderSub: 'Cinematic · Commercial · Motion',
  },

  // ──────────────────────────────────────────────────────────────────
  // 3. DANH SÁCH DỰ ÁN
  //    → Thêm / xóa / sửa dự án tại đây
  //    → Mỗi dự án là một object trong mảng này
  //
  //    CÁC TRƯỜNG CỦA MỖI DỰ ÁN:
  //    - id        : Mã định danh duy nhất (không dấu, không khoảng trắng)
  //    - title     : Tên dự án
  //    - category  : Phân loại (hiển thị nhỏ phía trên tên)
  //    - desc      : Mô tả chi tiết (hiện trong lightbox khi click)
  //    - tags      : Các kỹ thuật dùng (cách nhau bằng ·)
  //    - size      : Kích thước card: 'large' | 'medium' | 'small'
  //    - thumbnail : Đường dẫn ảnh thumbnail (để null dùng gradient màu)
  //    - embedUrl  : Link video nhúng YouTube/Vimeo (để null nếu không có)
  //    - linkBehance: Link Behance cho dự án này
  //    - gradientClass: Màu nền gradient (khi không có thumbnail)
  //                     Các lựa chọn: 'pv-gradient-1' đến 'pv-gradient-5'
  // ──────────────────────────────────────────────────────────────────
  projects: [
    {
      id: 'silver-swallows-brand-film',
      title: 'Silver Swallows — Brand Film',
      category: 'Cinematography & Post-Production',
      desc: 'Phim thương hiệu toàn diện cho Silver Swallows Studio. Từ concept, quay phim, dựng phim đến chỉnh màu DaVinci Resolve. Cinemagraph cinematic 4K.',
      tags: 'Cinematography · Color Grading · Editing',
      size: 'large',           // Card lớn — hiển thị đầu tiên nổi bật nhất
      thumbnail: null,         // Thay bằng: 'assets/project-1.jpg'
      embedUrl: null,          // Thay bằng: 'https://www.youtube.com/embed/VIDEO_ID'
      linkBehance: 'https://www.behance.net/pdp23',
      gradientClass: 'pv-gradient-1',
    },
    {
      id: 'commercial-tvc-danang',
      title: 'Commercial TVC — Đà Nẵng Brand',
      category: 'Commercial Production',
      desc: 'Quay và dựng TVC thương mại cho thương hiệu địa phương tại Đà Nẵng. Adobe Premiere Pro + After Effects Motion Graphics.',
      tags: 'TVC · Motion Graphics · After Effects',
      size: 'medium',
      thumbnail: null,
      embedUrl: null,
      linkBehance: 'https://www.behance.net/pdp23',
      gradientClass: 'pv-gradient-2',
    },
    {
      id: 'motion-design-title-sequence',
      title: 'Motion Design — Title Sequence',
      category: 'Motion Design',
      desc: 'Thiết kế Title Sequence chuẩn cinema cho chuỗi sản phẩm video. Kết hợp After Effects và Python Manim để tạo hiệu ứng toán học chuyển động.',
      tags: 'Motion Design · Manim · After Effects',
      size: 'medium',
      thumbnail: null,
      embedUrl: null,
      linkBehance: 'https://www.behance.net/pdp23',
      gradientClass: 'pv-gradient-3',
    },
    {
      id: 'documentary-en-bac',
      title: 'Documentary Short — Én Bạc',
      category: 'Documentary',
      desc: 'Phim tài liệu ngắn về đội ngũ sáng tạo tại Silver Swallows Studio. Storytelling chân thực, ánh sáng tự nhiên, dựng phim tối giản.',
      tags: 'Documentary · Storytelling · DaVinci',
      size: 'small',
      thumbnail: null,
      embedUrl: null,
      linkBehance: 'https://www.behance.net/pdp23',
      gradientClass: 'pv-gradient-4',
    },
    {
      id: 'graphic-design-visual-identity',
      title: 'Graphic Design — Visual Identity',
      category: 'Graphic Design',
      desc: 'Thiết kế bộ nhận diện thương hiệu đồng bộ: logo, color palette, typography system cho thương hiệu sáng tạo tại miền Trung.',
      tags: 'Graphic Design · Branding · Identity',
      size: 'small',
      thumbnail: null,
      embedUrl: null,
      linkBehance: 'https://www.behance.net/pdp23',
      gradientClass: 'pv-gradient-5',
    },

    // ── THÊM DỰ ÁN MỚI Ở ĐÂY ──
    // Sao chép một block trên và dán vào, chỉnh sửa thông tin là xong!
    // Nhớ đổi id thành tên duy nhất, và size có thể là 'large', 'medium', 'small'
  ],

  // ──────────────────────────────────────────────────────────────────
  // 4. SECTION ABOUT — GIỚI THIỆU BẢN THÂN
  //    → Chỉnh sửa từng đoạn văn giới thiệu tại đây
  // ──────────────────────────────────────────────────────────────────
  about: {
    // Tiêu đề nhỏ phía trên (eyebrow text)
    eyebrow: 'The Story Behind the Frame',

    // Tiêu đề lớn (dòng 2 hiển thị nghiêng màu vàng)
    headlineLine1: 'Art Meets',
    headlineLine2: 'Engineering',   // ← dòng này sẽ in nghiêng màu accent

    // Các đoạn văn giới thiệu (mỗi phần tử là một <p>)
    // Dùng **từ** để in đậm, *từ* để in nghiêng
    bio: [
      'Tốt nghiệp chuyên ngành **Thiết kế Đồ họa tại FPT Polytechnic**, tôi mang trong mình nền tảng tư duy nghệ thuật sắc bén. Song hành đó là nền tảng **Cơ điện tử tại Đại học Duy Tân** — nơi tôi học cách phân tích vấn đề một cách có hệ thống và logic.',
      'Sự kết hợp hiếm có này cho phép tôi không chỉ *cảm nhận* một cảnh quay đẹp, mà còn *hiểu được* tại sao nó đẹp — và tái hiện nó một cách kỹ thuật hoàn hảo.',
      'Tại **Silver Swallows Studio (Xưởng phim Én Bạc)**, tôi đảm nhận toàn bộ quy trình sản xuất: từ quay phim, setup ánh sáng trên set, đến dựng phim và chỉnh màu — với vai trò *Production Specialist*.',
    ],

    // Danh sách kỹ năng chính (hiển thị dạng text cách nhau bằng |)
    skills: [
      'Adobe Premiere Pro',
      'After Effects',
      'DaVinci Resolve Studio',
      'Python (Manim)',
      'Prompt Engineering',
    ],

    // Thanh kỹ năng (skill bars) — level tính theo %
    skillBars: [
      { label: 'Cinematography & Camera',         level: 92 },
      { label: 'Video Editing & Post-Production',  level: 95 },
      { label: 'Motion Design & VFX',              level: 85 },
      { label: 'Color Grading',                    level: 88 },
      { label: 'AI & Python Automation',           level: 78 },
    ],

    // Bằng cấp / học vấn
    education: [
      { degree: 'Thiết kế Đồ họa',  school: 'FPT Polytechnic'    },
      { degree: 'Cơ điện tử',        school: 'Đại học Duy Tân'    },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  // 5. THÔNG TIN LIÊN HỆ
  //    → Cập nhật email, số điện thoại và mạng xã hội tại đây
  // ──────────────────────────────────────────────────────────────────
  contact: {
    email:    'phanducphat2310@gmail.com',
    phone:    '0796649266',

    // Địa chỉ hiển thị (không cần chính xác đến số nhà)
    location: 'Hải Châu, Đà Nẵng, Vietnam',

    // Các liên kết mạng xã hội
    socials: {
      linkedin: 'https://www.linkedin.com/in/phanducphat23',
      behance:  'https://www.behance.net/pdp23',

      // Thêm kênh khác nếu muốn:
      // youtube:   'https://www.youtube.com/@...',
      // instagram: 'https://www.instagram.com/...',
    },

    // Năm hiển thị trong footer
    copyrightYear: 2024,
  },

}; // ← Kết thúc PORTFOLIO_DATA — đừng xóa dòng này!
