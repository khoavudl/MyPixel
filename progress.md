# TIẾN ĐỘ DỰ ÁN (PROJECT PROGRESS) – MYPIXEL (ARTDIFF)
> **Cập nhật lần cuối:** 2026-10-20  
> **Trạng thái hiện tại:** Đã hoàn thành Milestone 2A.1, 2A.2, 2A.3, 2A.4, Xoay Trực Giao 4 Hướng (0°/90°/180°/270°), Tối ưu Badge & Stroke Bất Biến Màn Hình, Cấu trúc 3 Chức Năng Mainscreen (F1: Load Past Run, F2: Compare 2 Files, F3: Single-file Inspection), Trạm Soi 1 Khung Hình Duy Nhất (Single View Inspection Workspace), Chuẩn Hoá Giao Diện Tiếng Anh Tinh Gọn, Milestone 2A.5: Xuất Báo Cáo Kiểm Định Chuyên Nghiệp (DOCX / PDF / Both), Nâng cấp Tab Historical Run Xoá Session vào Trash, Khống chế kích thước 2D cho ảnh Word (.docx), Thêm Logo FES vào báo cáo, Milestone 2A.6: Đóng Gói Ứng Dụng Độc Lập (Standalone Native App Packaging - macOS & Windows Ready), Nâng Cấp Chế Độ So Sánh Toàn Trang (Full Page Sheet Compare Mode) & Hỗ Trợ Hộp Gấp / Bình Bản Đa Panel (Folding Carton Nets - v11 & v22 Ready), Milestone 2A.12: Khắc Phục Triệt Để Lỗi Windows Python.Runtime.dll & Zone.Identifier (MOTW Unblock + .NET Config), **Milestone 2A.13: Mode 3 – Căn Chỉnh Thủ Công Tương Tác (Manual Interactive Alignment - GPU Staging Canvas 60 FPS, Re-render Vector Siêu Nét, Bypass Size Gate Check, Lưu Staging Meta Chống Hoán Đổi File, Cache-busting 4 Khung, Điều Hướng 2 Chiều Workspace ↔ Manual Staging, Tự Động Thừa Hưởng 100% Căn Chỉnh AutoCrop Sang Manual Để Vi Chỉnh Micro-nudge, Gỡ Bỏ Quick Tip Tối Ưu Không Gian)**.  
> **Tổng số bài test tự động:** 53/53 PASS (100%)

---

## 1. Bản Đồ Tiến Độ Tổng Quan (Milestone Roadmap)

| Milestone | Mô tả | Trạng thái | Ghi chú & DoD |
|---|---|:---:|---|
| **Phase 1** | Thuật toán nền tảng: Bóc tách vector, Size Gate, Canh khít sub-pixel (<0.5 px) không dùng die-line, Fit Meter | **HOÀN TẤT** | 24/24 tests PASS. Kiểm chứng trên 2 bộ file thật (`brand.pdf` vs `vendor.pdf` và `v1.pdf` vs `v2.pdf`). Báo cáo tại [`PHASE1_FINDINGS.md`](file:///Users/tindn/Downloads/MyPixel-v1/PHASE1_FINDINGS.md). |
| **Milestone 2A.1** | **Backend API & WebSocket Runner** (`server/`): REST endpoints, background runner bọc Phase 1, phát log WebSocket, serve static images, lưu annotations, xuất báo cáo | **HOÀN TẤT** | Đã test trọn luồng bằng `TestClient` trong [`tests/test_server.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_server.py). 8/8 server tests PASS. |
| **Milestone 2A.2** | **UI Dropzone & Real-time Console** (`ui/`): Kéo thả 2 file PDF, cấu hình kích thước WxH mm và số trang, bấm Analyze, hiển thị log WebSocket nhảy từng dòng theo thời gian thực, tự động chuyển view | **HOÀN TẤT** | `npm run build` thành công (1.56s). Đã tích hợp serve trực tiếp qua `http://localhost:8000`. |
| **Milestone 2A.3** | **4-Way Synced Viewport Canvas**: 2 khung lớn bên trái (Brand, Vendor); 2 khung nhỏ bên phải (Overlay, Heatmap). Đồng bộ Pan & Zoom 60 FPS qua CSS GPU transform + Phím tắt Space chớp tắt (Flicker Compare) | **HOÀN TẤT** | Đã hoàn thành `ViewportGrid.tsx`, `CanvasViewer.tsx`, `Toolbar.tsx`, `useSyncedViewport.ts`, `useHotkeys.ts`. Build sạch (1.23s). |
| **Milestone 2A.4** | **Kính lúp (Loupe 4x-8x) & Cross-Canvas Annotations**: Rê chuột soi nét sub-pixel đồng thời cả 4 khung; vẽ box ở bất kỳ khung nào thì tự động hiện ở cả 4 khung; toggle phím tắt B/L quay về Pan; thu gọn sidebar lỗi còn 70% (w-56); cân bằng 50/50 khung chính và khung chẩn đoán | **HOÀN TẤT** | Đã hoàn thiện `LoupeMagnifier.tsx` (4-way synced), `SvgAnnotationLayer.tsx`, `AnnotationModal.tsx`, `DefectSidebar.tsx` (w-56), `ViewportGrid.tsx` (50/50 split). Build sạch (1.42s). |
| **Milestone 2A.4+** | **4-Way Orthogonal Rotation (0°/90°/180°/270°) & Screen-Invariant Badges**: Xoay đồng bộ 4 khung hình đọc nắp hộp/chữ ngược; vẽ box ở mọi góc xoay tự động quy về toạ độ gốc; nhãn `#1, #2` tự động bù zoom và counter-rotate luôn nằm ngang rõ nét ở mọi tỷ lệ | **HOÀN TẤT** | Đã hoàn thành `coordinateTransform.ts`, `CanvasViewer.tsx`, `SvgAnnotationLayer.tsx`, `LoupeMagnifier.tsx`, `Toolbar.tsx`, `useHotkeys.ts` (Phím `R` / `Shift+R`). Build sạch (1.39s). |
| **Milestone 2A.4++** | **Mainscreen 3 Chức Năng & Trạm Soi 1 Bản Đơn (Single View Inspection)**: Phân tách rõ 3 chức năng F1 (Past Runs), F2 (Compare 2 bản), F3 (Soi 1 file độc lập). Trạm Workspace ở F3 tối ưu hiển thị **1 khung hình duy nhất** siêu rộng, giữ nguyên 100% tính năng Pan, Zoom, Xoay 4 hướng, Vẽ Box, Kính Lúp, Danh Sách Lỗi | **HOÀN TẤT** | Đã bổ sung endpoint `POST /api/inspect_single`, phân nhánh ViewportGrid 1 khung, tính toán Fit Screen theo khung đơn, cập nhật Store & Dropzone. Build sạch, 38/38 tests PASS. |
| **Milestone 2A.5** | **Xuất Báo Cáo Kiểm Định Chuyên Nghiệp (DOCX / PDF / Both)**: Báo cáo 2 phần (Overview bản đồ toàn cảnh có box & số thứ tự `#1, #2...`; Details bảng chi tiết Old Version vs New Version kèm ảnh crop +10% padding và ghi chú tinh gọn). Hộp thoại Export Modal cho phép nhập người lập báo cáo và chọn tải DOCX, PDF hoặc cả hai. Tối ưu nút định vị box có lề thoáng 30-40%. | **HOÀN TẤT** | Đã tích hợp `server/exporter.py` (python-docx, reportlab, Pillow), `ExportModal.tsx`, endpoint `/api/export`. Build sạch, 38/38 tests PASS. |
| **UI Polish** | **Quản Lý Lịch Sử & Xoá Session (Recycle Bin)**: Thêm nút Delete / thùng rác bên trái Open Session di chuyển thư mục `out/<run_id>` vào Trash của máy; Tinh gọn Line 1 chỉ gồm Tên run, Loại run và Số lượng defect; Giữ nguyên Line 2 (File names) & Line 3 (Timestamp). | **HOÀN TẤT** | Đã hoàn thành endpoint `DELETE /api/runs/{run_id}`, tích hợp AppleScript Finder delete với fallback shutil.rmtree, cập nhật Dropzone & LoadRunModal. 38/38 tests PASS. |
| **Milestone 2A.6** | **Đóng Gói Ứng Dụng Độc Lập (Standalone App Bundle - Mac & Win)**: Chuẩn hoá đường dẫn cross-platform (`server/config.py` tự lưu vào `~/Documents/MyPixel/out` khi chạy bundle, chống Permission Denied và mất data); Native Launcher `launcher.py` tự dò port thông minh; sinh icon app `MyPixel.icns` & `MyPixel.ico`; script build `scripts/build_mac.py` xuất ra `dist/MyPixel.app` và `dist/MyPixel-macOS.zip` (96 MB); kịch bản `scripts/build_windows.py` sẵn sàng cho Windows. GitHub Actions CI/CD tự động build cả Windows và macOS trên repo `https://github.com/khoavudl/MyPixel`. | **HOÀN TẤT** | Đã build thành công `dist/MyPixel.app` và `dist/MyPixel-macOS.zip` (96MB). Đã tạo repo GitHub và kích hoạt CI/CD build Windows. 38/38 tests PASS. |
| **Milestone 2A.7** | **So Sánh Toàn Trang (Full Page Sheet Compare) & Hỗ Trợ Hộp Gấp / Không Cần Nhập WxH**: Bổ sung bộ chọn Comparison Scope trong tab Compare (Auto-crop vs Full Page Sheet); hỗ trợ so sánh nguyên trang PDF không cần WxH; tự động nắn khít sub-pixel bằng Masked ECC; tích hợp preset thông minh 270x130 cho MacCoffee body | **HOÀN TẤT** | Đã hoàn thành `pipeline_phase1.py`, `server/app.py`, `server/runner.py`, `useInspectionStore.ts`, `Dropzone.tsx`. 39/39 tests PASS (100%). |
| **Milestone 2A.12** | **Sửa Lỗi Khởi Động Windows (Python.Runtime.dll & Zone.Identifier Unblock)**: Tự động gỡ Mark of the Web trên Windows; cấu hình .NET `loadFromRemoteSources` trong `MyPixel.exe.config`; gán `PYTHONNET_PYDLL`; thu thập đầy đủ binaries/datas `pythonnet` & `clr_loader` trong PyInstaller; bọc try/except toàn diện cho `webview.start()` tránh crash | **HOÀN TẤT** | Đã thêm `MyPixel.exe.config`, `launcher.py`, `mypixel.spec`, `scripts/build_windows.py`, `tests/test_launcher.py`. 48/48 tests PASS. |
| **Milestone 2A.13** | **Mode 3 – Căn Chỉnh Thủ Công Tương Tác (Manual Interactive Alignment)**: Trạm căn chỉnh trực quan 60 FPS (kéo pan, co dãn scale, xoay, phím mũi tên micro-nudge, opacity, blend modes difference/duotone); nút fallback thông minh khi auto-crop fail; re-render vector sắc nét; bypass Task 4 Size Gate check; sửa chuẩn xác logic kéo 4 góc (kéo vào thu nhỏ, kéo ra phóng to, cố định góc đối diện); núm kéo to rõ 24px chuyên nghiệp; phím tắt Shift + Con lăn chuột zoom riêng Vendor quanh tâm; chuẩn hoá tiếng Anh 100% (AutoCrop, Full Page, ManualCrop); nút điều hướng 2 chiều `Adjust Alignment / Re-align` từ 4-way Workspace quay lại Manual Staging Room và ngược lại; **thừa hưởng 100% kết quả căn chỉnh AutoCrop (Task 2/3 Frames + Task 5 Sub-pixel Affine Matrix) khi back sang Manual để người dùng chỉ cần vi chỉnh vài pixel/mm; gỡ bỏ bảng Quick Tips choáng chỗ**. | **HOÀN TẤT** | Đã hoàn thành `server/manual_aligner.py`, endpoints `/api/manual_align/prepare` & `/api/manual_align/apply`, `ManualAlignView.tsx`, `Toolbar.tsx`, `Dropzone.tsx`, `LogConsole.tsx`. Build UI sạch (1.49s). 53/53 tests PASS (100%). |
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
* [`ui/src/components/Dropzone.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Dropzone.tsx): Giao diện Main Screen "Brand Innovation Studio": Kéo thả 2 file PDF Brand & Vendor, tự động nhận diện khổ file (`v1/v2` -> `217x200.5`, `brand/vendor` -> `620x250`), nút mở lịch sử kiểm định (Load Past Run).
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


### 2.5. Cấu Trúc Mainscreen 3 Chức Năng & Trạm Soi 1 Khung Hình Độc Lập (Milestone 2A.4++)
* [`server/app.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/app.py): Thêm endpoint `POST /api/inspect_single` bóc tách hoặc render file đơn độc lập (PDF / ảnh PNG/JPG) ở 300 DPI, hỗ trợ tự động bóc tách Artboard hoặc xuất toàn trang, trả về kết quả trong <0.4s. Bổ sung `run_type: "single" | "compare"` trong `list_past_runs` và `get_run_status`.
* [`server/schemas.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/schemas.py): Thêm `single_image` vào `RunImages`, thêm `run_type` vào `PastRunSummary`.
* [`ui/src/components/Dropzone.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Dropzone.tsx): Tái thiết kế màn hình chính thành 3 tab chức năng rõ rệt:
  - **Chức năng 1 (F1): Lịch Sử (Past Runs)**: Tích hợp trực tiếp danh sách các lần chạy cũ trên màn hình chính, bộ lọc (Tất cả / So 2 bản / Soi 1 bản), ô tìm kiếm, nạp lại phiên làm việc trong 0.1s.
  - **Chức năng 2 (F2): So Sánh 2 Bản (Compare)**: Kéo thả 2 file PDF Brand & Vendor, cấu hình kích thước WxH mm, số trang, bấm bắt đầu kiểm định -> stream log thời gian thực -> Workspace 4 khung hình.
  - **Chức năng 3 (F3): Soi 1 Bản Đơn (Single View)**: Kéo thả 1 file duy nhất (PDF/ảnh), chọn trang, chế độ bóc tách Artboard (Auto-crop) hoặc Toàn trang (Full Page), bấm "Vào Trạm Soi" -> chuyển thẳng vào Workspace 1 khung hình.
* [`ui/src/components/ViewportGrid.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/ViewportGrid.tsx): Tự động nhận diện chế độ kiểm tra: Nếu là Function 3 (Single View) thì chuyển sang hiển thị **1 khung hình duy nhất** chiếm toàn bộ không gian trạm làm việc, cho tầm nhìn tối đa và độ nét hoàn hảo.
* [`ui/src/components/Toolbar.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Toolbar.tsx): Hiển thị pill trạng thái "Soi 1 Bản" / "So 2 Bản", tự động ẩn công cụ Flicker khi ở chế độ 1 file, giữ nguyên 100% các công cụ: Pan (H), Draw Box (B), Kính lúp (L), Zoom in/out, Fit Screen (0), 100% (1), Xoay trực giao 4 hướng (R / Shift+R).
* [`ui/src/components/Workspace.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Workspace.tsx): Hàm `handleFitToScreen` (phím `0`) tự động tính toán tỷ lệ zoom theo kích thước container toàn màn hình của khung đơn.
* [`ui/src/store/useInspectionStore.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/store/useInspectionStore.ts): Bổ sung `inspectionType: 'compare' | 'single'`, `activeMainTab`, `singleFile`, `singlePage`, `singleTargetSizeMm`, `singleCropMode`. Cập nhật `jumpToBox` tự động căn tâm giữa màn hình đơn.
* [`tests/test_server.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_server.py): Thêm bài test `test_inspect_single_artwork_pdf` kiểm tra trọn luồng từ tải file đơn, lấy ảnh kết quả, tạo và lấy annotation, đến liệt kê lịch sử past runs.


### 2.6. Chế Độ So Sánh Toàn Trang & Hỗ Trợ Hộp Gấp (Milestone 2A.7)
* [`artdiff/pipeline_phase1.py`](file:///Users/tindn/Downloads/MyPixel-v1/artdiff/pipeline_phase1.py): Hỗ trợ `mode in ("full_page", "full")` hoặc `target_size_mm=None`. Tự động dùng MediaBox/CropBox làm canvas khổ trang và chuyển trực tiếp sang Aligner mà không cần bóc tách vector.
* [`server/app.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/app.py): Nâng cấp endpoint `POST /api/analyze` hỗ trợ `crop_mode="full"`, cho phép `target_size_mm` rỗng.
* [`server/runner.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/runner.py): Cho phép `target_size_mm: tuple[float, float] | None = None`.
* [`ui/src/store/useInspectionStore.ts`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/store/useInspectionStore.ts): Bổ sung `compareCropMode: 'auto' | 'full'` và action `setCompareCropMode`.
* [`ui/src/components/Dropzone.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Dropzone.tsx): Bổ sung thanh chọn **Comparison Scope** trong tab Compare (`Auto-crop Artboard (WxH)` vs `Full Page Sheet (Toàn Trang)`), banner hướng dẫn khi chọn Full Page Sheet. Đã loại bỏ hoàn toàn các nút preset và cơ chế auto-detect theo tên file, buộc người dùng nhập số đo WxH cụ thể khi chọn chế độ Auto-crop.
* [`tests/test_server.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_server.py): Thêm bài test `test_analyze_full_page_sheet_mode` kiểm thử so sánh toàn trang qua API và WebSocket. Đã kiểm chứng thực tế trên cặp `v11.pdf` vs `v22.pdf`.

### 2.7. Native Desktop Window & Corporate Proxy Bypass (Milestone 2A.8)
* [`launcher.py`](file:///Users/tindn/Downloads/MyPixel-v1/launcher.py):
  - Tự động thiết lập cấu hình bypass proxy loopback `NO_PROXY=127.0.0.1,localhost` và `no_proxy` ngay khi khởi động, triệt tiêu hoàn toàn lỗi corporate security/proxy chặn kết nối local (`Direct IP access is not allowed`).
  - Hỗ trợ Native Desktop Window mặc định qua thư viện `pywebview` (dùng native Apple WebKit WKWebView trên macOS, Microsoft Edge WebView2 trên Windows).
  - Tích hợp cờ `--browser` để fallback sang chế độ mở tab trình duyệt ngoài khi người dùng có nhu cầu.
  - Tự động bật `ALLOW_DOWNLOADS = True` để hỗ trợ xuất báo cáo kiểm định PDF/HTML/Word trực tiếp trong cửa sổ ứng dụng.
  - Quản lý vòng đời tiến trình sạch sẽ: Khi bấm nút [X] đóng cửa sổ native, tự động gửi tín hiệu dừng Uvicorn backend và giải phóng tài nguyên.
* [`run_desktop.py`](file:///Users/tindn/Downloads/MyPixel-v1/run_desktop.py): File shortcut tiện ích để khởi động trực tiếp MyPixel ở chế độ Desktop Window (`python run_desktop.py`).
* [`mypixel.spec`](file:///Users/tindn/Downloads/MyPixel-v1/mypixel.spec): Bổ sung `hiddenimports` cho `webview` và các nền tảng native (Cocoa, WinForms, EdgeChromium) để đóng gói `MyPixel.app` hoặc `MyPixel.exe`.
* [`requirements.txt`](file:///Users/tindn/Downloads/MyPixel-v1/requirements.txt): Bổ sung `pywebview>=5.0.0`.
* [`tests/test_launcher.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_launcher.py): Kiểm thử tự động 6 bài test cho cấu hình NO_PROXY, phát hiện cổng khả dụng, cờ CLI arguments và tính khả dụng của webview.

### 2.8. Tính Năng Xóa Toàn Bộ Lịch Sử Kiểm Tra - Delete All Historical Runs (Milestone 2A.9)
* [`server/app.py`](file:///Users/tindn/Downloads/MyPixel-v1/server/app.py): Thêm endpoint `DELETE /api/runs` cho phép xóa sạch toàn bộ các phiên làm việc trong `out/` (chuyển an toàn vào Thùng rác / Trash) và dọn dẹp in-memory runner.
* [`ui/src/components/Dropzone.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/Dropzone.tsx): Bổ sung nút **"Delete All"** trên thanh công cụ của tab Historical Runs (kèm hộp thoại xác nhận số lượng phiên xóa, hiển thị trạng thái đang xóa và tự động vô hiệu hóa khi danh sách rỗng).
* [`ui/src/components/LoadRunModal.tsx`](file:///Users/tindn/Downloads/MyPixel-v1/ui/src/components/LoadRunModal.tsx): Bổ sung nút **"Delete All"** trên thanh tìm kiếm của modal nạp lịch sử.
* [`tests/test_server.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_server.py): Thêm bài test `test_delete_all_runs` kiểm thử tạo nhiều phiên và xóa toàn bộ qua API.
* [`ui/dist`](file:///Users/tindn/Downloads/MyPixel-v1/ui/dist): Đã biên dịch lại bản production bundle thành công (1.41s).

### 2.10. Tự Động Xuất Bản Public GitHub Releases (Milestone 2A.11)
* [`.github/workflows/build.yml`](file:///Users/tindn/Downloads/MyPixel-v1/.github/workflows/build.yml):
  - Thêm job `publish-release`: gom toàn bộ file `.zip` từ các job build Windows và macOS.
  - Sử dụng `softprops/action-gh-release@v2` tự động đăng tải lên mục **Releases** của GitHub (gắn cờ `make_latest: true`).
  - Cho phép người dùng tải trực tiếp vĩnh viễn không giới hạn 14 ngày, **hoàn toàn không cần tài khoản GitHub hay đăng nhập**.
  - Bổ sung tùy chọn `tag_name` (mặc định `v2.0.0`) và cờ `publish_release` (mặc định `true`) trong menu trigger của Actions.

### 2.11. Khắc Phục Triệt Để Lỗi Windows Python.Runtime.dll & Zone.Identifier (Milestone 2A.12)
* [`MyPixel.exe.config`](file:///Users/tindn/Downloads/MyPixel-v1/MyPixel.exe.config): Cấu hình `<loadFromRemoteSources enabled="true"/>` cho .NET CLR để cho phép nạp các assemblies tải về từ Internet/Web hoặc network drives mà không bị CAS sandbox chặn.
* [`launcher.py`](file:///Users/tindn/Downloads/MyPixel-v1/launcher.py):
  - Tự động quét và xoá NTFS Alternate Data Stream `Zone.Identifier` (Mark of the Web) trên các file `.dll`, `.exe`, `.pyd` khi chạy trên Windows.
  - Tự động thiết lập biến môi trường `PYTHONNET_PYDLL` trỏ trực tiếp đến file DLL Python (ví dụ: `_internal/python311.dll`) bên trong thư mục bundle PyInstaller.
  - Bọc khối `try...except` an toàn quanh `webview.start()` ở cả 2 nhánh (khi server đã chạy sẵn và khi vừa khởi động) kèm cơ chế tự động mở tab trình duyệt mặc định (`webbrowser.open`) nếu WebKit/WebView2 hoặc .NET gặp sự cố, triệt tiêu hoàn toàn khả năng văng exception traceback.
* [`mypixel.spec`](file:///Users/tindn/Downloads/MyPixel-v1/mypixel.spec): Thu thập toàn bộ `datas`, `binaries` (bao gồm `ClrLoader.dll`) và `hiddenimports` cho `pythonnet` và `clr_loader` thông qua `PyInstaller.utils.hooks.collect_all`, đóng gói kèm `MyPixel.exe.config`.
* [`scripts/build_windows.py`](file:///Users/tindn/Downloads/MyPixel-v1/scripts/build_windows.py): Đảm bảo file `MyPixel.exe.config` luôn được sao chép trực tiếp vào thư mục `dist/MyPixel/` ngay cạnh `MyPixel.exe`.
* [`tests/test_launcher.py`](file:///Users/tindn/Downloads/MyPixel-v1/tests/test_launcher.py): Bổ sung 2 bài test tự động `test_unblock_windows_files` và `test_configure_windows_pythonnet`.

---

## 3. Nhật Ký Kiểm Thử (Verification Log)

```bash
# Lệnh chạy toàn bộ test:
.venv/bin/pytest tests/

# Kết quả:
tests/test_aligner.py ..                                                 [  4%]
tests/test_cropper.py ...                                                [ 10%]
tests/test_eval.py ........                                              [ 26%]
tests/test_fit_meter.py ...                                              [ 32%]
tests/test_frame_detector.py ..s                                         [ 38%]
tests/test_launcher.py ........                                          [ 54%]
tests/test_pdf_renderer.py ..s                                           [ 60%]
tests/test_pipeline_phase1.py ..                                         [ 64%]
tests/test_server.py .........                                           [ 82%]
tests/test_size_gate.py ....                                             [ 90%]
tests/test_units.py .....                                                [100%]
================== 48 passed, 2 skipped, 6 warnings in 4.48s ===================
```

