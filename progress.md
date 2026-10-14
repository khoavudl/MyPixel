# TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS) – MYPIXEL (ARTDIFF)
> **Cập nhật lần cuối:** 2026-10-14  
> **Trạng thái hiện tại:** Đã hoàn thành Milestone 2A.1, 2A.2, 2A.3, 2A.4, Xoay Trực Giao 4 Hướng (0°/90°/180°/270°), Tối ưu Badge & Stroke Bất Biến Màn Hình (Screen-Space Invariant Sizing), Tối ưu hiệu năng ảnh chỉ báo (2048px) & Tính năng Nạp Phiên Cũ (Load Past Run). Sẵn sàng cho Milestone 2A.5 (1-Click Export Report).  
> **Tổng số bài test tự động:** 36/36 PASS (100%)

---

## 1. Bản Đồ Tiến Độ Tổng Quan (Milestone Roadmap)

| Milestone | Mô tả | Trạng thái | Ghi chú & DoD |
|---|---|:---:|---|
| **Phase 1** | Thuật toán nền tảng: Bóc tách vector, Size Gate, Canh khít sub-pixel (<0.5 px) không dùng die-line, Fit Meter | **HOÀN TẤT** | 24/24 tests PASS. Kiểm chứng trên 2 bộ file thật (`brand.pdf` vs `vendor.pdf` và `v1.pdf` vs `v2.pdf`). Báo cáo tại [`PHASE1_FINDINGS.md`](file:///Users/tindn/Downloads/MyPixel-v1/PHASE1_FINDINGS.md). |
| **Milestone 2A.1** | **Backend API & WebSocket Runner** (`server/`): REST endpoints, background runner bọc Phase 1, phát log WebSocket, serve static images, lưu annotations, xuất báo cáo | **HOÀN TẤT** | Đã test trọn luồng bằng `TestClient` trong [`tests/test_server.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_server.py). 4/4 server tests PASS. |
| **Milestone 2A.2** | **UI Dropzone & Real-time Console** (`ui/`): Kéo thả 2 file PDF, cấu hình kích thước WxH mm và số trang, bấm Analyze, hiển thị log WebSocket nhảy từng dòng theo thời gian thực, tự động chuyển view | **HOÀN TẤT** | `npm run build` thành công (1.17s). Đã tích hợp serve trực tiếp qua `http://localhost:8000`. |
| **Milestone 2A.3** | **4-Way Synced Viewport Canvas**: 2 khung lớn bên trái (Brand, Vendor); 2 khung nhỏ bên phải (Overlay, Heatmap). Đồng bộ Pan & Zoom 60 FPS qua CSS GPU transform + Phím tắt Space chớp tắt (Flicker Compare) | **HOÀN TẤT** | Đã hoàn thành `ViewportGrid.tsx`, `CanvasViewer.tsx`, `Toolbar.tsx`, `useSyncedViewport.ts`, `useHotkeys.ts`. Build sạch (1.23s). |
| **Milestone 2A.4** | **Kính lúp (Loupe 4x-8x) & Cross-Canvas Annotations**: Rê chuột soi nét sub-pixel đồng thời cả 4 khung; vẽ box ở bất kỳ khung nào thì tự động hiện ở cả 4 khung; toggle phím tắt B/L quay về Pan; thu gọn sidebar lỗi còn 70% (w-56); cân bằng 50/50 khung chính và khung chẩn đoán | **HOÀN TẤT** | Đã hoàn thiện `LoupeMagnifier.tsx` (4-way synced), `SvgAnnotationLayer.tsx`, `AnnotationModal.tsx`, `DefectSidebar.tsx` (w-56), `ViewportGrid.tsx` (50/50 split). Build sạch (1.42s). |
| **Milestone 2A.4+** | **4-Way Orthogonal Rotation (0°/90°/180°/270°) & Screen-Invariant Badges**: Xoay đồng bộ 4 khung hình đọc nắp hộp/chữ ngược; vẽ box ở mọi góc xoay tự động quy về toạ độ gốc; nhãn `#1, #2` tự động bù zoom và counter-rotate luôn nằm ngang rõ nét ở mọi tỷ lệ | **HOÀN TẤT** | Đã hoàn thành `coordinateTransform.ts`, `CanvasViewer.tsx`, `SvgAnnotationLayer.tsx`, `LoupeMagnifier.tsx`, `Toolbar.tsx`, `useHotkeys.ts` (Phím `R` / `Shift+R`). Build sạch (1.39s). |
| **Milestone 2A.5** | **1-Click Export Report**: Xuất biên bản kiểm tra (HTML / PDF / JSON) có ảnh cắt cận cảnh từng box và bảng ghi chú chi tiết | *CHỜ DUYỆT* | Kế hoạch tiếp theo. |
| **Phase 2B** | **Tích hợp Gợi ý Khác biệt Tự động (Assisted Auto-diff)**: Tự động vẽ sẵn các box nghi vấn lên UI cho người dùng duyệt | *TƯƠNG LAI* | Sau khi hoàn thiện UI Phase 2A. |

---

## 2. Chi Tiết Các Phần Đã Hoàn Thành

### 2.1. Core Thuật Toán Phase 1 (`artdiff/`)
* [`artdiff/core/units.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/core/units.py): Quy đổi chính xác 2 chiều mm $\leftrightarrow$ pt $\leftrightarrow$ px.
* [`artdiff/ingest/pdf_renderer.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/ingest/pdf_renderer.py): Render PDF trang chỉ định ở tỉ lệ cố định `px/mm` (300 DPI), đọc vector candidate và OCG layer.
* [`artdiff/normalize/frame_detector.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/normalize/frame_detector.py): Dò khung vector siêu tốc (<0.6 ms) và raster fallback. Tự động ghép panel liền kề.
* [`artdiff/normalize/cropper.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/normalize/cropper.py): Xác nhận khung và cắt Artboard.
* [`artdiff/normalize/size_gate.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/normalize/size_gate.py): Kiểm định khổ kích thước và tỉ lệ aspect ratio (`PASS`, `SCALED_FILE`, `ASPECT_MISMATCH`, `SIZE_MISMATCH`).
* [`artdiff/normalize/aligner.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/normalize/aligner.py): Canh khít sub-pixel bằng Shi-Tomasi sub-pixel + Lucas-Kanade + RANSAC kết hợp Masked ECC (không bị kéo lệch bởi nội dung bị sửa).
* [`artdiff/normalize/fit_meter.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/normalize/fit_meter.py): Đo độ khít bằng lưới $10 \times 4$ với `phaseCorrelate` và xuất bộ 3 ảnh chẩn đoán.
* [`artdiff/pipeline_phase1.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/pipeline_phase1.py): Bổ sung hook `on_progress` an toàn để bắn sự kiện tiến trình qua server.

### 2.2. Backend FastAPI Server (`server/`)
* [`server/config.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/config.py): Cấu hình thư mục output `out/`, uploads, profiles và static build `ui/dist`.
* [`server/schemas.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/schemas.py): Pydantic models chuẩn hoá cho request/response và WebSocket messages.
* [`server/runner.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/runner.py): Background thread pool executor bọc Phase 1, WebSocket connection manager hỗ trợ log replay.
* [`server/exporter.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/exporter.py): Xuất báo cáo kiểm tra dạng HTML in ấn đẹp mắt và JSON.
* [`server/app.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/app.py): Khởi tạo FastAPI app với lifespan, CORS, REST upload, WebSocket streaming, static file mounting và endpoint `GET /api/runs` liệt kê lịch sử kiểm định.

### 2.3. Frontend Client (`ui/`)
* [`ui/src/types/index.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/types/index.ts): Khớp 1-1 với Pydantic schemas của Backend, bổ sung `PastRunSummary`.
* [`ui/src/store/useInspectionStore.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/store/useInspectionStore.ts): Central Zustand store quản lý state toàn cục (viewport, zoom, pan, sync, flicker, annotations, loupeScaleFactor).
* [`ui/src/components/Dropzone.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Dropzone.tsx): Kéo thả 2 file PDF Brand & Vendor, tự động nhận diện khổ file (`v1/v2` -> `217x200.5`, `brand/vendor` -> `620x250`), nút mở lịch sử kiểm định (Load Past Run).
* [`ui/src/components/LoadRunModal.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/LoadRunModal.tsx): Hộp thoại tìm kiếm và nạp trực tiếp phiên kiểm định cũ từ thư mục `out/`, tự động khôi phục ảnh 4 khung và toàn bộ Bounding Box lỗi để vào thẳng Workspace trong 0.1s.
* [`ui/src/components/LogConsole.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/LogConsole.tsx): Terminal log thời gian thực qua WebSocket, thanh tiến trình, 6 pill trạng thái cho 6 task, banner gợi ý sửa lỗi khi lệch khổ kích thước.
* [`ui/src/hooks/useSyncedViewport.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/hooks/useSyncedViewport.ts): Hook đồng bộ Pan & Zoom to cursor mượt mà giữa các khung hình qua CSS GPU transform.
* [`ui/src/hooks/useHotkeys.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/hooks/useHotkeys.ts): Bắt phím tắt bàn phím: `Space` (Flicker compare), `H` (Pan), `0` (Fit), `1` (100%), `+`/`-` (Zoom), `S` (Toggle sync).
* [`ui/src/components/CanvasViewer.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/CanvasViewer.tsx): Khung hiển thị ảnh độc lập áp dụng GPU Hardware-Accelerated transform (`translate3d` và `scale`) cho ảnh độ phân giải lớn, hỗ trợ chế độ Flicker đối chiếu.
* [`ui/src/components/ViewportGrid.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/ViewportGrid.tsx): Bố cục chia cột 4 khung hình (2 lớn bên trái 62%, 2 nhỏ bên phải 38%).
* [`ui/src/components/Toolbar.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Toolbar.tsx): Thanh công cụ kiểm định chuyên dụng: Pan (H), Draw Box (B), Loupe (L), Flicker (Space), Zoom, Fit screen (0), 100% (1), 4-Way Sync toggle (S), và nút mở Danh sách lỗi.
* [`ui/src/components/SvgAnnotationLayer.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/SvgAnnotationLayer.tsx): Lớp vẽ SVG đồng bộ 4 khung hình. Vẽ box trên bất kỳ khung nào thì hiển thị tức thì trên cả 4 khung với toạ độ chuẩn hoá $[0,1]$ và mm thực tế.
* [`ui/src/components/LoupeMagnifier.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/LoupeMagnifier.tsx): Kính lúp tròn phóng đại tương đối (Relative Magnification `effectiveZoom = viewport.zoom * loupeScaleFactor`), tự động co dãn mượt mà chạy theo nhịp lăn chuột zoom in/out, hỗ trợ phím tắt `[` / `]` và `Shift + Lăn chuột` điều chỉnh hệ số phóng từ 1.5x - 8.0x, tâm ngắm crosshair và toạ độ mm thực tế.
* [`ui/src/components/AnnotationModal.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/AnnotationModal.tsx): Hộp thoại modal "Ghi Chú" tinh gọn (chỉ giữ lại Ghi chú chi tiết và toạ độ mm, loại bỏ tag/severity rườm rà), tự động đồng bộ API backend.
* [`ui/src/components/DefectSidebar.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/DefectSidebar.tsx): Thanh sidebar danh sách lỗi tinh gọn (đã bỏ 3 khung thống kê Crit/Maj/Min và các tag/severity badge trên từng card), hỗ trợ bấm vào là cả 4 khung hình bay đến tâm box (`jumpToBox`), nút 1-Click Export.
* [`ui/src/components/CanvasViewer.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/CanvasViewer.tsx): Khung hiển thị ảnh độc lập áp dụng GPU Hardware-Accelerated transform (`translate3d` và `scale`), hỗ trợ không gian toạ độ ảo (Virtual Coordinate Space) cho ảnh chỉ báo (Overlay/Heatmap) đồng bộ 100% với ảnh Brand full-res, chống ghi đè kích thước store và bật willChange khi dragging.
* [`ui/src/components/Workspace.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Workspace.tsx): Trạm làm việc kiểm định hoàn chỉnh kết hợp Toolbar, ViewportGrid, DefectSidebar, AnnotationModal và Hotkeys.
* [`ui/src/App.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/App.tsx) & [`ui/src/main.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/main.tsx): Layout Dark Mode hoàn chỉnh.
* [`ui/dist/`](file:///Users/tindn/Downloads/MyPixel-v1/ui/dist): Bản build production sẵn sàng (1.39s).

### 2.4. Tính Năng Xoay Trực Giao 4 Hướng & Badge Bất Biến Màn Hình (Milestone 2A.4+)
* [`ui/src/utils/coordinateTransform.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/utils/coordinateTransform.ts): Module ánh xạ 2 chiều nghịch đảo hoàn hảo ($100\%$ Invertible) giữa toạ độ màn hình xoay và toạ độ chuẩn hoá $[0, 1]$ của ảnh gốc cho cả 4 góc ($0^\circ, 90^\circ, 180^\circ, 270^\circ$).
* [`ui/src/components/SvgAnnotationLayer.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/SvgAnnotationLayer.tsx): Áp dụng `vectorEffect="non-scaling-stroke"` giúp viền box luôn dày 2px/3.5px rõ nét ở mọi độ zoom. Badge số `#1, #2...` áp dụng bù zoom (`scale(1 / zoom)`) và triệt tiêu góc xoay (`rotate(-rotation)`), đảm bảo số luôn to rõ (~18px cao) và luôn nằm ngang xuôi mắt đọc.
* [`ui/src/components/CanvasViewer.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/CanvasViewer.tsx): Khung hiển thị outer bounding box theo kích thước đã xoay ($W \leftrightarrow H$) và container con GPU-transformed mượt mà, kèm pill góc xoay trên card header.
* [`ui/src/components/LoupeMagnifier.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/LoupeMagnifier.tsx): Soi nét đồng bộ 4 khung hình theo toạ độ xoay, ảnh trong tròng kính lúp xoay cùng góc với khung nhìn bên ngoài.
* [`ui/src/components/Toolbar.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Toolbar.tsx) & [`ui/src/hooks/useHotkeys.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/hooks/useHotkeys.ts): Bổ sung 2 nút xoay ⟲ (CCW) / ⟳ (CW), badge góc xoay, cùng phím tắt `R` (Xoay phải $90^\circ$) và `Shift + R` (Xoay trái $90^\circ$).
* [`ui/src/components/Workspace.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Workspace.tsx): Nút Fit screen (phím `0`) tự động tính toán lại kích thước hiển thị theo góc xoay ($W \leftrightarrow H$).


---

## 3. Nhật Ký Kiểm Thử (Verification Log)

```bash
# Lệnh chạy toàn bộ test:
.venv/bin/pytest

# Kết quả:
tests/test_aligner.py ..                                                 [  5%]
tests/test_cropper.py ...                                                [ 13%]
tests/test_eval.py ........                                              [ 35%]
tests/test_fit_meter.py ...                                              [ 43%]
tests/test_frame_detector.py ..s                                         [ 51%]
tests/test_pdf_renderer.py ..s                                           [ 59%]
tests/test_pipeline_phase1.py ..                                         [ 64%]
tests/test_server.py .....                                               [ 76%]
tests/test_size_gate.py ....                                             [ 86%]
tests/test_units.py .....                                                [100%]
================== 36 passed, 2 skipped, 6 warnings in 2.74s ===================
```
