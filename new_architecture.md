# MYPIXEL (ARTDIFF) – NEW ARCHITECTURE SPECIFICATION
> **Phiên bản:** 2.0-UI  
> **Mục tiêu:** Hệ thống kiểm định bao bì in ấn tương tác (Pre-press Artwork Inspection & Alignment Workspace)  
> **Mô hình triển khai:** Local Web Application (FastAPI Backend + React Vite SPA Frontend)

---

## 1. Bối cảnh & Tầm nhìn Chuyển đổi

### 1.1. Vấn đề thực tế
Trong quy trình duyệt in bao bì (Pre-press Brand QC), sự can thiệp và phê duyệt của con người (**Human-in-the-loop**) là bắt buộc. Một lỗi sai sót nhỏ về thành phần, thiếu dấu tiếng Việt, hoặc sai mã vạch bị bỏ sót có thể dẫn đến việc tiêu huỷ hàng triệu bản in.

Giai đoạn **Phase 1** của dự án đã giải quyết xuất sắc bài toán nền tảng cốt lõi:
- Tự động bóc tách vùng thiết kế $W \times H$ mm từ 2 file PDF bất kỳ (Brand và Vendor) bằng vector PDF kết hợp raster fallback.
- Đưa về cùng hệ toạ độ và **chồng khít tới mức sub-pixel ($< 0.5\text{ px}$)** mà không phụ thuộc vào die-line, không bị kéo lệch bởi các nội dung bị sửa đổi.
- Xuất ra bộ ảnh chuẩn: `brand_cropped.png`, `vendor_cropped.png`, `B_aligned.png`, `overlay.png`, `absdiff_heatmap.png`.

### 1.2. Bước chuyển đổi sang Architecture 2.0
Thay vì cố gắng hoàn thiện một thuật toán so sánh tự động 100% bằng dòng lệnh (vốn tiềm ẩn nguy cơ false positive hoặc false negative trong các ca in phức tạp), hệ thống chuyển sang xây dựng một **Trạm làm việc kiểm định trực quan (Interactive Inspection Workspace)**:
1. Cho phép người dùng kéo thả trực tiếp 2 file PDF, bấm **Analyze** và theo dõi toàn bộ log tiến trình Phase 1 theo thời gian thực.
2. Hiển thị song song **4 khung nhìn đồng bộ tuyệt đối** (Brand, Vendor, Overlay, Diff Heatmap).
3. Hỗ trợ các công cụ soi chuyên dụng của ngành in: **4-Way Synced Pan/Zoom, Kính lúp (Magnifier Loupe), Chớp tắt so sánh (Flicker/Blink Compare)**.
4. Cho phép **vẽ Bounding Box & ghi chú bắt lỗi (Defect Annotation)**: Vẽ ở bất kỳ khung nào, chiếc box sẽ tự động hiển thị ở cả 3 khung còn lại.
5. **1-Click Export:** Xuất biên bản kiểm định (Audit Report) dạng PDF/HTML/JSON gửi trực tiếp cho Vendor/Supplier để yêu cầu sửa đổi.

---

## 2. Kiến trúc Hệ thống Tổng thể (High-Level Architecture)

```mermaid
flowchart TD
    subgraph UI["Frontend SPA (React + Vite + TailwindCSS)"]
        A[Dropzone: Brand & Vendor PDF] -->|1. Upload & Param| B[WebSocket / REST Client]
        B -->|2. Stream Log & Status| C[Console Log Panel]
        D[4-Way Synced Viewport Canvas] <-->|Central State: Pan, Zoom, Tools| E[Zustand Store]
        F[Cross-Canvas SVG Annotation Layer] <-->|Sync BBoxes & Notes| E
        G[Defect Sidebar & Punch List] -->|Export Request| H[Export Generator]
    end

    subgraph Server["Backend Server (FastAPI - Localhost)"]
        B <-->|WebSocket: /ws/analyze| I[Analysis Pipeline Runner]
        I -->|Gọi nội bộ| J["Phase 1 Pipeline (artdiff)"]
        J -->|Lưu ảnh & report| K["Workspace Storage (out/<run_id>/)"]
        K -->|Serve Static Images| D
        H <-->|POST /api/export| L[Audit Report Exporter]
        E <-->|POST /api/annotations| M[Annotation Store (JSON)]
    end
```

---

## 3. Cấu trúc Thư mục Dự án

```text
MyPixel-v1/
├── artdiff/                      # Core thuật toán Phase 1 (Bảo toàn nguyên vẹn)
│   ├── core/                     # models.py, units.py
│   ├── ingest/                   # pdf_renderer.py
│   ├── normalize/                # frame_detector.py, cropper.py, size_gate.py, aligner.py, fit_meter.py
│   ├── pipeline_phase1.py        # Orchestrator Phase 1
│   └── profiles/default.yaml
├── server/                       # Backend FastAPI (Mới)
│   ├── __init__.py
│   ├── app.py                    # Khởi tạo FastAPI app, middleware, routes
│   ├── runner.py                 # Runner bọc pipeline_phase1 + hook stream log qua WebSocket
│   ├── schemas.py                # Pydantic models (AnalyzeRequest, Annotation, ExportRequest...)
│   ├── exporter.py               # Sinh báo cáo kiểm tra (HTML / JSON / PDF)
│   └── config.py                 # Đường dẫn thư mục, port, cấu hình mặc định
├── ui/                           # Frontend React + Vite + TypeScript (Mới)
│   ├── public/
│   ├── src/
│   │   ├── api/                  # REST client & WebSocket client
│   │   ├── components/
│   │   │   ├── Dropzone.tsx             # Vùng kéo thả 2 file PDF + nhập kích thước mm
│   │   │   ├── LogConsole.tsx           # Terminal log trực tiếp từng bước của Phase 1
│   │   │   ├── ViewportGrid.tsx         # Bố cục 4 khung hình (2 lớn bên trái, 2 nhỏ bên phải)
│   │   │   ├── CanvasViewer.tsx         # Khung xem ảnh đơn lẻ (hỗ trợ GPU transform)
│   │   │   ├── SvgAnnotationLayer.tsx   # Lớp vẽ & đồng bộ Bounding Box đa khung
│   │   │   ├── LoupeMagnifier.tsx       # Kính lúp soi nét (4x-8x) kèm pixel grid
│   │   │   ├── Toolbar.tsx              # Thanh công cụ: Pan, Zoom, Draw Box, Loupe, Blink
│   │   │   ├── AnnotationModal.tsx      # Modal nhập Tag lỗi, mức độ, ghi chú
│   │   │   └── DefectSidebar.tsx        # Danh sách lỗi bắt được + Nút xuất báo cáo
│   │   ├── hooks/
│   │   │   ├── useSyncedViewport.ts     # Hook đồng bộ Pan/Zoom giữa 4 khung
│   │   │   └── useHotkeys.ts            # Phím tắt (Space: Blink, B: Box, H: Hand, L: Loupe)
│   │   ├── store/
│   │   │   └── useInspectionStore.ts    # Central Zustand store
│   │   ├── types/                       # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── tests/                        # Unit tests hiện tại và mới
├── pyproject.toml
└── new_architecture.md
```

---

## 4. Đặc tả Chi tiết các Thành phần

### 4.1. Backend (`server/`)
* **Công nghệ:** Python 3.11+, `FastAPI`, `uvicorn`, `websockets`, `pydantic`.
* **Cơ chế Pipeline Runner (`server/runner.py`):**
  * Nhận file PDF từ upload, ghi vào thư mục tạm `out/<run_id>/uploads/`.
  * Khởi tạo `pipeline_phase1.run_phase1(...)` trong background task hoặc thread riêng.
  * Tích hợp cơ chế **Log Interceptor**: Đón bắt toàn bộ log của từng Task (Task 1 Render $\to$ Task 2 Detect Frame $\to$ Task 3 Crop $\to$ Task 4 Size Gate $\to$ Task 5 Align $\to$ Task 6 Fit Meter) và đẩy ngay lập tức qua WebSocket dạng JSON:
    ```json
    {
      "type": "log",
      "task": "task2_frame_detect",
      "status": "IN_PROGRESS",
      "message": "Detecting frame: Vector method found (34.96, 24.36, 620.0, 250.0) mm...",
      "timestamp": 1718000000.12
    }
    ```
  * Khi hoàn tất: Gửi event `PIPELINE_COMPLETE` kèm đường dẫn tĩnh đến 4 ảnh kết quả:
    - `/api/runs/{run_id}/images/brand_cropped.png`
    - `/api/runs/{run_id}/images/vendor_cropped.png` (hoặc `B_aligned.png`)
    - `/api/runs/{run_id}/images/overlay.png`
    - `/api/runs/{run_id}/images/absdiff_heatmap.png`

### 4.2. Frontend UI (`ui/`)
* **Giao diện làm việc (Workspace Layout):**
  * **Header:** Thanh công cụ kiểm định (Toolbar): Nút Pan (Bàn tay), Zoom In/Out, Fit Screen, 100% Size, Vẽ Box, Kính lúp Loupe, Nút Flicker (Chớp tắt), Nút Export Report.
  * **Màn hình chính (Chia 2 cột theo đúng yêu cầu người dùng):**
    * **Cột trái (Chiếm 60–65% chiều rộng):** 2 khung hình chính kích thước lớn:
      1. Khung trên: `Brand Cropped` (Artboard gốc).
      2. Khung dưới: `Vendor Cropped` (Bản Vendor đã canh khít sub-pixel).
    * **Cột phải (Chiếm 35–40% chiều rộng):** 
      1. Khung trên: `Overlay.png` (Ảnh chồng 2 bản có gán kênh màu đối chiếu).
      2. Khung dưới: `Absdiff Heatmap.png` (Bản đồ nhiệt chỉ rõ pixel chênh lệch).
  * **Thanh bên (Right Drawer / Sidebar):** Danh sách các Defect/Box đã tạo. Bấm vào lỗi nào thì cả 4 khung lập tức Pan & Zoom vào đúng vị trí đó.

---

## 5. Hợp đồng Đồng bộ Hệ toạ độ (Coordinate System & Multi-Canvas Sync Contract)

Đây là thành phần cốt lõi đảm bảo trải nghiệm: **"Vẽ box ở khung nào thì 3 khung kia hiện y hệt, Pan/Zoom một khung thì 3 khung còn lại trượt theo"**.

### 5.1. Mô hình toạ độ chuẩn hoá (Normalized Coordinates)
Tất cả ảnh crop và aligned đều có chung kích thước Artboard thực tế ($W \times H$ mm) và cùng kích thước pixel chuẩn $W_{px} \times H_{px}$.

Mọi toạ độ Bounding Box được lưu trữ dưới dạng **Toạ độ chuẩn hoá [0, 1]** và **Toạ độ mm thực**:
```typescript
interface DefectBox {
  id: string;               // UUID hoặc số thứ tự 1, 2, 3...
  // Tỉ lệ tương đối so với kích thước Artboard (0.0 -> 1.0)
  norm_x: number;
  norm_y: number;
  norm_w: number;
  norm_h: number;
  // Toạ độ thực tế trên thiết kế (mm)
  bbox_mm: [number, number, number, number]; // [x_mm, y_mm, w_mm, h_mm]
  // Thông tin nghiệp vụ
  tag: "content" | "shift" | "barcode" | "missing_char" | "color" | "other";
  severity: "critical" | "major" | "minor";
  note: string;
  created_at: string;
}
```

### 5.2. Cơ chế Đồng bộ 4-Way Viewport
* **Zustand Viewport State:**
  ```typescript
  interface ViewportState {
    zoom: number;         // Tỉ lệ phóng đại (0.1x -> 32x)
    panX: number;         // Độ lệch trục X (px trên màn hình)
    panY: number;         // Độ lệch trục Y (px trên màn hình)
    isSynced: boolean;    // Mặc định luôn bật (True)
  }
  ```
* Khi người dùng lăn chuột (Wheel) hoặc kéo (Drag/Pan) trên bất kỳ khung nào trong 4 khung:
  1. Tính toán `deltaX`, `deltaY` hoặc `newZoom` dựa trên tâm con trỏ chuột.
  2. Dispatch cập nhật vào `useInspectionStore`.
  3. Cả 4 thẻ container áp dụng thuộc tính CSS GPU-accelerated:
     ```css
     transform: translate3d(${panX}px, ${panY}px, 0) scale(${zoom});
     transform-origin: 0 0;
     will-change: transform;
     ```
  4. Đảm bảo tốc độ hiển thị đạt **60 FPS mượt mà** ngay cả với ảnh 21–30 Megapixel.

### 5.3. Cơ chế Vẽ & Hiển thị Box Đồng bộ
* Trên mỗi khung hình có một lớp `<svg className="absolute inset-0 pointer-events-auto">` nằm đè lên.
* Khi người dùng chọn công cụ **Draw Box** và kéo chuột trên bất kỳ khung nào:
  * Sự kiện chuột tính ra `norm_x, norm_y, norm_w, norm_h` dựa trên kích thước thật của ảnh.
  * Khi thả chuột, một box tạm thời được tạo và phát sinh vào Store.
  * Cả 4 lớp SVG trên 4 khung hình lập tức vẽ một hình chữ nhật `<rect>` với toạ độ tương ứng.
  * Mở hộp thoại nhập Tag & Note.

---

## 6. Kế hoạch Triển khai Tổng quan theo Phase (Roadmap)

Kế hoạch được chia thành các Phase rõ ràng, tuân thủ nguyên tắc **làm xong kiểm thử vững chắc từng phần rồi mới chuyển tiếp**:

```
[Phase 1] (DONE)               [Phase 2A] (UI & Inspection Core)      [Phase 2B] (Assisted AI Diff)
Algorithmic Sub-pixel    ──>   FastAPI Backend + React SPA     ──>    Tích hợp gợi ý Auto-diff
Alignment & Size Gate          4-Way Synced Viewport + Loupe          vào danh sách Box trên UI
                               Cross-Canvas Annotation & Export
```

### Giai đoạn 2A: Trạm làm việc kiểm định tương tác (Interactive Workspace)
* **Milestone 2A.1 – Backend API & Pipeline Wrapper:**
  * Tạo cấu trúc module `server/`.
  * Viết `server/runner.py` bọc `pipeline_phase1.run_phase1`, bắt stdout/stderr và emit tiến trình từng Task qua WebSocket.
  * Endpoint REST: Upload file PDF, lấy danh sách runs, lấy file ảnh tĩnh, lưu/đọc annotations.
  * *Tiêu chí hoàn thành:* Chạy thử lệnh curl/Postman hoặc script test upload 2 file mẫu, nhận đủ log WebSocket và file ảnh trả về.
* **Milestone 2A.2 – Frontend Shell, Dropzone & Real-time Console:**
  * Khởi tạo dự án `ui/` bằng Vite + React + TypeScript + TailwindCSS.
  * Xây dựng màn hình khởi động: 2 ô Drag-and-drop cho file Brand PDF và Vendor PDF; ô nhập `W x H mm` (mặc định cho phép tự động hoặc nhập tay), ô chọn trang (default trang 1).
  * Màn hình Log Console hiển thị thanh tiến trình và log từng bước của Phase 1 sinh động.
  * *Tiêu chí hoàn thành:* Kéo thả 2 file, bấm "Analyze", log chạy theo thời gian thực và tự động chuyển sang màn hình Workspace khi thành công.
* **Milestone 2A.3 – 4-Way Synced Viewport Canvas:**
  * Xây dựng layout chia cột: Bên trái 2 ảnh lớn (`Brand`, `Vendor`), bên phải 2 ảnh nhỏ (`Overlay`, `Heatmap`).
  * Tích hợp cơ chế đồng bộ Pan/Zoom qua Zustand và CSS transform GPU.
  * Thêm công cụ Fit to Screen, Zoom 100%, Zoom In/Out.
  * Tích hợp chế độ **Flicker / Blink Compare** (nhấn phím `Space` để chớp tắt giữa Brand và Vendor).
  * *Tiêu chí hoàn thành:* Kéo hoặc zoom ở bất kỳ khung nào, cả 4 khung trượt mượt mà 60 FPS theo đúng toạ độ sub-pixel.
* **Milestone 2A.4 – Kính lúp (Magnifier Loupe) & Cross-Canvas Annotations:**
  * Xây dựng công cụ Kính lúp: Rê chuột đến đâu, tròng kính lúp hiện lên phóng đại 4x-8x soi rõ từng nét chữ và dấu tiếng Việt.
  * Xây dựng lớp SVG Annotation: Vẽ box ở bất kỳ khung nào, box lập tức hiện ở cả 4 khung.
  * Modal nhập thông tin lỗi: Chọn loại lỗi, mức độ nghiêm trọng, ghi chú giải thích.
  * Sidebar quản lý danh sách lỗi: Click vào lỗi nào, viewport tự động bay đến toạ độ lỗi đó.
  * *Tiêu chí hoàn thành:* Khoanh được 5 lỗi trên cặp `v1_vs_v2` và 4 lỗi trên cặp `brand_vs_vendor`.
* **Milestone 2A.5 – Xuất Biên bản Báo cáo (Audit Defect Report):**
  * Xây dựng tính năng xuất báo cáo 1-click:
    - File HTML/PDF chứa thông tin 2 file, kích thước, bảng tổng hợp các lỗi kèm hình ảnh crop cận cảnh của từng box và ghi chú.
    - File JSON lưu toạ độ chuẩn phục vụ lưu trữ hoặc tích hợp hệ thống.
  * *Tiêu chí hoàn thành:* Xuất ra file báo cáo hoàn chỉnh có thể gửi cho Supplier.

### Giai đoạn 2B: Tích hợp Gợi ý Khác biệt Tự động (Assisted Auto-Diff)
* Sau khi người dùng đã có UI hoàn chỉnh để duyệt tay:
* Đưa các thuật toán từ `PHASE2_SPEC.md` (`pixel_diff`, `local_align`, `regions`) vào chạy nền sau khi Phase 1 hoàn tất.
* Tự động sinh sẵn các Bounding Box nghi ngờ có lỗi lên danh sách Defect.
* Người dùng chỉ việc duyệt qua từng box: Bấm **[Chấp nhận lỗi]** hoặc **[Bỏ qua]** $\to$ Nâng cao năng suất kiểm định lên gấp 10 lần.
