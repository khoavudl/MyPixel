# ARTDIFF – PHASE 1: Chọn vùng · Đưa về cùng hệ · Chồng khít

> Spec cho coding agent (Updated v2). **Chỉ làm đúng phạm vi Phase 1.** Không làm so chữ, so màu, so hình, OCR, barcode, UI.
> Làm theo từng Task, **test xong Task này mới sang Task sau**. Không generate cả project một lần.

---

## 0. Bối cảnh & Ràng buộc đầu vào

- Team Brand gửi artwork bao bì cho agency/supplier. Supplier gửi lại bản đã dàn trang.
- Cần so 2 bản để tìm chỗ **bị sửa chủ động** (sửa, thêm, xóa).
- Phase 1 chỉ giải bài: **chọn đúng vùng thiết kế ở 2 file → đưa về cùng hệ phân giải → chồng khít**, sao cho khi chồng lên nhau thì phần lớn trùng, chỉ lòi ra các chỗ bị sửa.

### Đặc điểm thực tế của Input (Đã cập nhật)

1. **Kích thước thiết kế (`W × H` mm) thay đổi tuỳ design:**
   - Không cố định `620 × 250 mm`.
   - **User sẽ nhập trực tiếp `W, H` (mm)** khi chạy (qua CLI `--size-mm WxH` hoặc nhập ở chế độ interactive). Không cần đoán kích thước từ file.
2. **Số trang và vị trí trang chứa Artwork thay đổi tuỳ file:**
   - File Supplier không phải lúc nào cũng có 2 trang, và vùng cần compare không phải lúc nào cũng nằm ở trang 1.
   - **User sẽ nhập số trang cần compare** của Brand (`--brand-page`, mặc định trang `1`) và của Vendor/Supplier (`--vendor-page`, mặc định trang `1`).
   - **Không phụ thuộc vào trang die-line riêng (như trang 2 của file mẫu)** và **không phụ thuộc vào đường die-line bên trong thiết kế** (vì có những file không có trang die-line hoặc không vẽ die-line).
3. **Ràng buộc trên trang được chọn:**
   - Trên trang được chọn để compare chỉ chứa **1 mẫu artwork chính** (có thể kèm đường ghi chú kích thước, khung ký duyệt, bảng màu, remark xung quanh).
   - 2 bản Brand và Supplier **đã được đảm bảo cùng chiều (orientation)** trước khi đưa vào tool.

### Đặc điểm quan sát trên cặp file mẫu hiện tại (`brand.pdf` & `vendor.pdf`)

| | `brand.pdf` | `vendor.pdf` |
|---|---|---|
| Số trang | 1 | 2 (nhưng Phase 1 chỉ đọc trang artwork do user chỉ định, mặc định trang 1) |
| Khổ thiết kế mẫu | 620 × 250 mm | 620 × 250 mm |
| Ngoài artwork | Đường kích thước (xanh) | Đường kích thước (tím), khung ký duyệt BATICO, bảng màu, remark ở dưới |
| Lớp text | Có nhưng lỗi mã hóa | Chữ đã outline |
| Nguồn | **Không xuất từ cùng 1 file**, **khác resolution** | |

### Giả định (cần kiểm chứng trong Phase 1, ghi kết quả vào report)
- **G1.** Lệch giữa 2 bản sau khi đã cùng chiều chủ yếu là **dịch + scale (+ xoay rất nhỏ)**, không có méo cục bộ (non-rigid).
- **G2.** Khung bao ngoài của vùng thiết kế ở 2 bản đều có kích thước mục tiêu `W × H` mm do user nhập (hoặc tỷ lệ tương ứng nếu file bị scale).
- **G3.** Có thể có hoặc không có `TrimBox` / layer (`OCG`) trong PDF; có thể tìm khung bằng **Vector PDF (`page.get_drawings()`)** hoặc **Ảnh Raster (`OpenCV`)** — cần chạy cả 2 phương án để so sánh thực tế.

---

## 1. Phạm vi

**Trong phạm vi**
1. Nhận thông số từ user: file Brand, file Vendor, kích thước mục tiêu `W × H` (mm), số trang Brand & Vendor (mặc định trang 1).
2. Render trang PDF được chọn → ảnh raster theo tỉ lệ `px/mm` cố định + trích xuất thông tin Vector/Box của trang.
3. Tìm khung bao ngoài của vùng artwork `W × H` (mm) ở mỗi trang bằng **cả 2 phương án (PDF Vector & OpenCV Raster)** để đối chiếu, bỏ phần ghi chú/khung ký duyệt/bảng màu bên ngoài.
4. Cho người dùng xác nhận / chọn phương án khung / chỉnh khung (dạng CLI + ảnh preview).
5. Kiểm tra khổ (`size_gate`) so với kích thước `W × H` đã nhập và đối chiếu chéo giữa 2 file.
6. Canh 2 ảnh cho khít (thô + mịn) **không phụ thuộc die-line** (dùng đặc trưng thiết kế + RANSAC + ECC với outlier masking).
7. Đo độ khít, xuất report + ảnh kiểm tra.

**Ngoài phạm vi (KHÔNG làm)**
- So chữ / hình / màu, OCR, barcode, khoanh vùng khác biệt, change log, UI web.

---

## 2. Tech stack

- Python 3.11+
- `PyMuPDF` (`fitz`): render PDF, đọc `TrimBox`/`CropBox`/`MediaBox`, `OCG`, và đọc vector drawings (`page.get_drawings()`)
- `opencv-python`, `numpy`
- `pyyaml`, `pytest`
- Không dùng thư viện cần GPU, không dùng dịch vụ cloud. Toàn bộ chạy local (file bảo mật).

---

## 3. Nguyên tắc thiết kế (bắt buộc)

1. **Đơn vị chuẩn là mm.** Kích thước mục tiêu, khung crop, report đều lưu mm. Pixel chỉ là chi tiết nội bộ. Dùng `core/units.py` để đổi `mm ↔ px`.
2. **Không resize ảnh raster để đưa về cùng hệ.** Phải **render lại từ PDF** ở mức zoom tính sẵn để 1 mm = cùng số px ở cả 2 bên.
3. **Không phụ thuộc vào die-line.**
   - Khi tìm khung (Task 2): dựa vào kích thước `W × H` (mm) user nhập để bắt khung bao ngoài của artwork (kết hợp so sánh 2 nhánh Vector PDF và Raster OpenCV).
   - Khi canh khít (Task 5): dựa vào phần lớn thiết kế không đổi (80–95%) bằng RANSAC + mask loại bỏ vùng nghi bị sửa nội dung khi chạy ECC, để mảng nội dung bị sửa không kéo lệch phép canh.
4. **Fail rõ ràng, không fail âm thầm.** Không canh được / sai khổ → trả lỗi có lý do + số liệu, không xuất ảnh "có vẻ ổn".
5. Mỗi module **thuần hàm, input/output là dataclass**, test được độc lập.
6. Log mọi tham số và kết quả từng bước (bao gồm kết quả so sánh 2 phương án tìm khung) vào `report.json` (truy vết được).

---

## 4. Cấu trúc thư mục

```
artdiff/
  core/
    models.py          # dataclass: PageMeta, RasterPage, Frame, FrameDetectionCompare, Artboard, GateResult, AlignResult, FitReport
    units.py           # mm<->px, zoom từ DPI / px_per_mm
  ingest/
    pdf_renderer.py    # Task 1: render trang chỉ định + đọc Box/OCG/Vector drawings
  normalize/
    frame_detector.py  # Task 2: dò khung WxH bằng cả Vector & Raster để so sánh
    cropper.py         # Task 3: confirm & crop
    size_gate.py       # Task 4: kiểm tra khổ so với target_size_mm và giữa A - B
    aligner.py         # Task 5: đưa về cùng hệ + canh thô (RANSAC) + canh mịn (masked ECC)
    fit_meter.py       # Task 6: đo độ khít + xuất overlay/heatmap/grid
  pipeline_phase1.py   # Task 7: orchestrator + CLI
  profiles/
    default.yaml       # cấu hình chung (không fix cứng size_mm hay số trang)
  tests/
    fixtures/
    test_*.py
  out/                 # kết quả mỗi lần chạy (gitignore)
```

Hướng phụ thuộc: `core ← các module ← pipeline_phase1`. Module cùng tầng không gọi nhau.

---

## 5. Hợp đồng dữ liệu (`core/models.py`)

```python
@dataclass
class VectorRectCandidate:
    bbox_mm: tuple[float, float, float, float]   # x, y, w, h (mm)
    stroke_color: tuple[float, ...] | None
    fill_color: tuple[float, ...] | None
    source_type: str                             # "rect" | "path_bbox" | "line_group"

@dataclass
class RasterPage:
    img: np.ndarray                              # BGR uint8
    px_per_mm: float
    page_size_mm: tuple[float, float]            # (width_mm, height_mm)
    trimbox_mm: tuple[float, float, float, float] | None   # x, y, w, h
    cropbox_mm: tuple[float, float, float, float] | None   # x, y, w, h
    ocg_layers: list[str]
    vector_candidates: list[VectorRectCandidate] # trích từ page.get_drawings()
    source: str                                  # "brand" | "vendor"
    page_number: int                             # 1-based page number do user chọn
    pdf_path: str

@dataclass
class Frame:
    bbox_mm: tuple[float, float, float, float]   # x, y, w, h trên trang (mm)
    method: str                                  # "trimbox" | "pdf_vector" | "opencv_raster" | "manual"
    confidence: float                            # 0..1
    size_err_mm: tuple[float, float]             # (|w - W_target|, |h - H_target|)
    confirmed: bool
    elapsed_ms: float = 0.0

@dataclass
class FrameDetectionReport:
    target_size_mm: tuple[float, float]          # (W, H) do user nhập
    trimbox_candidate: Frame | None
    vector_candidate: Frame | None               # Kết quả Phương án 1 (PDF Vector)
    raster_candidate: Frame | None               # Kết quả Phương án 2 (OpenCV Raster)
    selected: Frame                              # Khung được chọn đề xuất

@dataclass
class Artboard:
    img: np.ndarray                              # đã crop đúng khung
    px_per_mm: float
    size_mm: tuple[float, float]                 # (w, h) thực tế của khung
    frame: Frame
    source: str
    page_number: int
    pdf_path: str

@dataclass
class GateResult:
    status: str                                  # "PASS" | "SCALED_FILE" | "ASPECT_MISMATCH" | "SIZE_MISMATCH"
    passed: bool
    scale_factor_b_to_a: tuple[float, float]     # (scale_x, scale_y)
    aspect_diff: float
    size_diff_mm_a: tuple[float, float]          # độ lệch của A so với target (W, H)
    size_diff_mm_b: tuple[float, float]          # độ lệch của B so với target (W, H)
    reason: str | None

@dataclass
class AlignResult:
    ok: bool
    transform: list[list[float]]                 # ma trận 2x3 (affine) B -> A
    coarse_method: str                           # "feature_ransac" | "phase_corr" | "identity"
    fine_method: str | None                      # "ecc_masked" | None
    inlier_count: int
    inlier_rmse_px: float | None
    stable_coverage_ratio: float | None          # tỉ lệ diện tích vùng ổn định dùng cho ECC
    reason: str | None

@dataclass
class FitReport:
    passed: bool
    inlier_max_err_px: float | None
    inlier_rmse_px: float | None
    grid_shift_px: list[list[float]]             # độ lệch còn lại từng ô lưới (NaN cho ô trơn)
    grid_max_shift_px: float                     # max độ lệch ở các ô ổn định
    flagged_cells: list[dict]                    # danh sách các ô vượt ngưỡng (do lệch thật hoặc do nội dung bị sửa)
    reason: str | None
```

---

## 6. Profile (`profiles/default.yaml`)

> Không cố định `size_mm` và số trang trong profile nữa. Profile chỉ lưu các tham số độ phân giải và ngưỡng thuật toán.

```yaml
profile_id: default_v1
px_per_mm: 11.811            # ~300 DPI; tham số có thể override
default_pages:
  brand: 1                   # 1-based, mặc định trang 1
  vendor: 1                  # 1-based, mặc định trang 1
size_tolerance_mm: 1.5       # dung sai tìm khung & kiểm tra khổ (mm)
aspect_tolerance: 0.003      # dung sai tỉ lệ W/H
align:
  min_ransac_inliers: 12
  ransac_reproj_threshold_px: 2.0
  stable_diff_threshold: 25  # ngưỡng |A - B| (0..255) để loại vùng nghi bị sửa khỏi mask ECC
  ecc_max_iter: 200
  ecc_eps: 1.0e-6
  max_inlier_rmse_px: 1.0
  grid: [10, 4]
  max_grid_shift_px: 1.0
  min_cell_std: 8.0          # bỏ qua ô nền trơn có std < ngưỡng này
```

---

## 7. Các Task chi tiết

> Mỗi Task: **Mục đích → Việc cần làm → Đầu ra → Test / tiêu chí xong.**

### Task 1 – Render PDF & Trích xuất thông tin trang (`ingest/pdf_renderer.py`)
**Mục đích:** Từ `pdf_path` và `page_number` (1-based do user nhập, mặc định 1), render ảnh raster với tỉ lệ `px_per_mm` chính xác từ vector, đồng thời trích xuất metadata hình học (`TrimBox`, `CropBox`, `OCG`, và các vector path/rect) để phục vụ Task 2.

**Việc cần làm**
- `render_page(pdf_path, page_number, px_per_mm, source) -> RasterPage`
- Kiểm tra `1 <= page_number <= len(doc)`, nếu vượt quá trả lỗi rõ ràng (`PAGE_OUT_OF_RANGE`).
- Quy đổi `page_index = page_number - 1`.
- Zoom PyMuPDF = `px_per_mm * 25.4 / 72.0`.
- Render nền trắng, không alpha (`alpha=False`), chuyển sang `BGR uint8`.
- Đọc `TrimBox` và `CropBox` (nếu có và khác `MediaBox`), đổi từ pt sang mm (`1 pt = 25.4 / 72 mm`).
- Liệt kê `OCG` (layer) nếu có.
- Trích xuất danh sách `VectorRectCandidate` từ `page.get_drawings()` (quy đổi tọa độ bounding box của các path/rect/đường thẳng giao nhau sang mm).

**Test**
- Render trang 1 của `brand.pdf` và trang 1 của `vendor.pdf`: `img.shape` khớp `page_size_mm * px_per_mm` (±1 px).
- Hai lần render cùng tham số → ảnh **byte-equal**.
- Truyền `page_number` không hợp lệ → raise lỗi đúng mã.

---

### Task 2 – Tìm khung artwork `W × H` bằng 2 phương án (`normalize/frame_detector.py`)
**Mục đích:** Dựa vào kích thước mục tiêu `target_size_mm = (W, H)` do user nhập, tự động tìm đúng khung thiết kế `W × H` trên trang đã chọn (bỏ phần ghi chú kích thước, khung ký duyệt, bảng màu bên ngoài) mà **không cần trang die-line riêng**. Chạy song song 2 phương án để đối chiếu.

**Việc cần làm** – `detect_frame(page: RasterPage, target_size_mm: tuple[float, float], profile) -> FrameDetectionReport`
1. **Kiểm tra `TrimBox` (`trimbox_candidate`):**
   - Nếu trang có `TrimBox` và kích thước `(w, h)` khớp `target_size_mm` (trong `size_tolerance_mm`) hoặc khớp tỉ lệ `W/H` (trong `aspect_tolerance`) → ghi nhận `trimbox_candidate` (`confidence = 1.0`).
2. **Phương án 1 – Dò trên Vector PDF (`pdf_vector`):**
   - Quét các `vector_candidates` từ `page.get_drawings()`:
     - Tìm các hình chữ nhật vector (`rect` / `quad`), các `path` khép kín, hoặc tổ hợp các đoạn thẳng ngang/dọc dài tạo thành khung bao có kích thước `(w, h)` gần `target_size_mm` (hoặc tỉ lệ `w/h ≈ W/H`).
     - Chấm điểm `confidence` dựa trên: độ lệch kích thước `(|w - W| + |h - H|)` và độ khép kín của 4 cạnh.
3. **Phương án 2 – Dò trên Ảnh Raster (`opencv_raster`):**
   - Chuyển `page.img` sang ảnh xám → phát hiện cạnh (Canny / Sobel gradient) + hình thái học / đoạn thẳng dài (Hough / LSD) + contour/bounding box của vùng có mật độ nội dung:
     - Tìm khung hình chữ nhật có kích thước `(w, h)` (quy ra mm) khớp với `target_size_mm` (trong `size_tolerance_mm`) hoặc khớp tỉ lệ `W/H`.
     - Loại trừ các khung con bên trong hoặc khung bảng ký duyệt ở dưới nhờ đối chiếu với kích thước mục tiêu `(W, H)`.
     - Chấm điểm `confidence` từ độ khớp kích thước + cường độ cạnh dọc theo 4 biên khung.
4. **Chọn khung đề xuất (`selected`) & Xuất ảnh so sánh:**
   - Lưu kết quả của **cả 2 phương án** (`vector_candidate` và `raster_candidate`, cùng `trimbox_candidate` nếu có) vào `FrameDetectionReport`.
   - Khung `selected` lấy phương án có `confidence` cao nhất (nếu không phương án nào đạt ngưỡng tối thiểu thì trả `Frame(method="manual", confidence=0, confirmed=False)`).
   - Vẽ ảnh debug `out/<run>/frame_<source>.png`: vẽ cả khung Vector (màu xanh lá) và khung Raster (màu cam) kèm thông số `(x, y, w, h, conf)` để trực quan so sánh.

**Test**
- Ảnh tổng hợp có khung `W × H` bất kỳ (vd `400 × 180 mm` và `620 × 250 mm`) kèm bảng ký duyệt bên dưới → cả 2 nhánh hoạt động đúng, sai số ≤ 0.5 mm.
- Chạy trên trang 1 của `brand.pdf` và trang 1 của `vendor.pdf` với target `620 × 250` → xuất báo cáo so sánh giữa `pdf_vector` và `opencv_raster`.

---

### Task 3 – Xác nhận & Crop (`normalize/cropper.py`)
**Mục đích:** Người duyệt chốt khung (hoặc chọn giữa kết quả Vector / Raster / nhập tay) trước khi đi tiếp.

**Việc cần làm**
- `confirm_frame(report: FrameDetectionReport, preview_path, mode) -> Frame`
  - `mode="interactive"`: in thông tin so sánh giữa `vector_candidate` và `raster_candidate` + đường dẫn ảnh preview, hỏi:
    - `[y]` chấp nhận khung đề xuất (`selected`)
    - `[v]` chọn khung Vector / `[r]` chọn khung Raster
    - `[e]` nhập lại `x,y,w,h` (mm)
    - `[q]` dừng.
  - `mode="auto"`: tự chấp nhận `report.selected` nếu `confidence ≥ 0.9`, ngược lại dừng với lỗi `FRAME_NOT_CONFIRMED`.
- `crop(page: RasterPage, frame: Frame) -> Artboard`: crop theo `frame.bbox_mm` đổi sang px.

**Test**
- Crop đúng kích thước px mong đợi.
- `auto` + confidence thấp → raise lỗi `FRAME_NOT_CONFIRMED`.

---

### Task 4 – Kiểm tra khổ (`normalize/size_gate.py`)
**Mục đích:** Chặn sớm trường hợp sai khổ so với `target_size_mm = (W, H)` user nhập hoặc lệch khổ giữa A và B.

**Việc cần làm** – `check_size(a: Artboard, b: Artboard, target_size_mm: tuple[float, float], profile) -> GateResult`
1. Tính `size_mm` của A, B và tỉ lệ `aspect = w / h`.
2. So **tỉ lệ dài/rộng** giữa A, B và `W / H`:
   - Lệch quá `aspect_tolerance` → **FAIL** `ASPECT_MISMATCH`, ghi rõ bên nào lệch bao nhiêu.
3. So **kích thước tuyệt đối** của A và B với `target_size_mm = (W, H)`:
   - Cả 2 khớp trong `size_tolerance_mm` → **PASS**.
   - Không khớp kích thước tuyệt đối nhưng tỉ lệ `w/h` khớp → **PASS có cảnh báo** `SCALED_FILE` (file bị thu/phóng tỷ lệ), ghi hệ số scale.
   - Còn lại → **FAIL** `SIZE_MISMATCH`, báo rõ chênh bao nhiêu mm, theo chiều nào, bên nào.

**Test**: 3 case `PASS` / `SCALED_FILE` / `FAIL` (`ASPECT_MISMATCH`, `SIZE_MISMATCH`) bằng `Artboard` tổng hợp.

---

### Task 5 – Đưa về cùng hệ & Canh khít không dùng die-line (`normalize/aligner.py`)
**Mục đích:** Đưa 2 Artboard về cùng kích thước pixel từ vector PDF, sau đó khử độ lệch dịch/scale/xoay nhỏ mà **không phụ thuộc vào đường die-line** và **không bị kéo lệch bởi vùng nội dung bị sửa**.

**Việc cần làm**
- **5a. Đưa về cùng hệ (Re-render từ PDF):**
  - Nếu `SCALED_FILE` hoặc kích thước px giữa Artboard A và Artboard B chênh lệch: tính lại `px_per_mm_adjusted` cho B và **render lại từ PDF** trang B rồi crop theo `frame_b` sao cho Artboard B có **đúng cùng kích thước `(H_px, W_px)`** với Artboard A. **Tuyệt đối không dùng `cv2.resize`.**
- **5b. Canh thô (Coarse Alignment – Feature RANSAC / Phase Correlation):**
  - Phát hiện keypoints & descriptors (dùng `ORB` / `AKAZE` phân bố đều theo lưới trên ảnh xám của A và B).
  - Match descriptors (KNN ratio test) + ước lượng ma trận Affine (`cv2.estimateAffinePartial2D` gồm dịch + scale đồng nhất + xoay) bằng **RANSAC** (`ransacReprojThreshold = 2.0 px`).
  - Nhờ RANSAC, 80–95% vùng thiết kế giữ nguyên sẽ làm **inliers** quyết định ma trận biến đổi; các vùng bị sửa nội dung sẽ tự động bị loại thành **outliers**.
  - Nếu số inliers `< min_ransac_inliers`: fallback sang `cv2.phaseCorrelate` (chỉ dịch `dx, dy`).
- **5c. Canh mịn (Fine Alignment – Masked ECC):**
  - Áp tạm ma trận canh thô 5b lên B để tính ảnh chênh lệch thô `diff = |A_gray - B_coarse_gray|`.
  - Tạo `stable_mask`: chỉ giữ lại các pixel có `diff < stable_diff_threshold` (loại bỏ những mảng có sự thay đổi nội dung lớn giữa Brand và Vendor + loại bỏ viền ngoài sau warp).
  - Chạy `cv2.findTransformECC` (`MOTION_AFFINE`, làm mờ Gaussian nhẹ `sigma ~ 1.0 px`) khởi tạo từ ma trận 5b, truyền `inputMask = stable_mask`.
  - Nếu ECC không hội tụ → giữ nguyên kết quả 5b, ghi `fine_method = None` + lý do.
- **5d. Warp:**
  - Warp B về hệ của A bằng `cv2.warpAffine` (`INTER_LINEAR`, viền ngoài tô trắng).
  - Xuất `valid_mask` (vùng có dữ liệu thật sau warp) để loại viền ở bước đo và các Phase sau.

**Đầu ra:** `AlignResult`, `B_aligned.png`, `valid_mask.png`, `stable_mask.png`.

**Test**
- Lấy 1 ảnh artwork, tạo bản B bằng dịch `(3.4, -2.1)` px + scale `1.003` + xoay `0.1°` → sau canh, sai số RMSE trên inliers `< 0.5 px`.
- Thêm 1 mảng lớn bị sửa (xóa/thêm đoạn chữ hoặc đổi màu 1 vùng) vào B → kết quả ma trận canh **không đổi đáng kể** (< 0.2 px) so với khi không có mảng sửa đó.

---

### Task 6 – Đo độ khít (`normalize/fit_meter.py`)
**Mục đích:** Có con số định lượng để biết `PASS`/`FAIL`, tách biệt giữa "lệch toàn cục do canh sai" và "lệch cục bộ do nội dung bị sửa".

**Việc cần làm** – `measure_fit(a, b_aligned, valid_mask, align_result, profile) -> FitReport`
1. **Sai số trên tập điểm ổn định (`inlier_rmse_px`, `inlier_max_err_px`):** khoảng cách dư (residual) của các inlier keypoints sau phép biến đổi cuối cùng.
2. **Bản đồ lệch theo lưới (`grid_shift_px`, mặc định `10 × 4`):**
   - Mỗi ô: dùng `cv2.phaseCorrelate` giữa `A` và `B_aligned` → độ lệch `(dx, dy)` và chuẩn `shift_px = hypot(dx, dy)`.
   - Bỏ qua ô gần như trơn (`std < min_cell_std`) → đánh dấu `NaN`.
   - Những ô có nội dung bị sửa (ví dụ ô chứa dòng chữ thêm mới) có thể có `shift_px` cao cục bộ: liệt kê toàn bộ các ô có `shift_px > max_grid_shift_px` vào `flagged_cells` để người xem kiểm tra.
3. **Tiêu chí `PASS`:**
   - `inlier_rmse_px ≤ max_inlier_rmse_px` **và** phần lớn các ô lưới (median / 80th percentile của các ô hợp lệ, tức vùng không bị sửa) có `shift_px ≤ max_grid_shift_px`.

**Ảnh kiểm tra xuất ra** (`out/<run>/`):
- `overlay.png`: A kênh đỏ, `B_aligned` kênh xanh lơ (cyan) — chỗ khớp ra xám/trắng đen, chỗ khác biệt hiện rõ màu Đỏ/Xanh.
- `absdiff_heatmap.png`: `|A − B_aligned|` trên ảnh xám, áp colormap; ngoài `valid_mask` tô đen.
- `grid_shift.png`: vẽ lưới ô đè lên ảnh, mỗi ô ghi độ lệch `px` và tô màu theo ngưỡng.

**Test**
- Cặp ảnh giống hệt → mọi ô ≈ 0, `PASS`.
- Cặp ảnh lệch toàn cục 2 px không qua bước canh → `FAIL`, các ô báo ≈ 2 px.

---

### Task 7 – Orchestrator + CLI (`pipeline_phase1.py`)
**Mục đích:** Chạy trọn Phase 1 bằng 1 lệnh CLI với đầy đủ tham số kích thước và số trang.

```bash
python -m artdiff.pipeline_phase1 \
  --brand brand.pdf \
  --vendor vendor.pdf \
  --size-mm 620x250 \
  --brand-page 1 \
  --vendor-page 1 \
  --profile profiles/default.yaml \
  --mode interactive|auto \
  --out out/
```

Luồng:
```
nhận input (size WxH, brand_page, vendor_page)
  → render trang chỉ định (T1)
  → tìm khung bằng cả Vector & Raster + xuất ảnh so sánh (T2)
  → xác nhận + crop (T3)
  → kiểm tra khổ so với WxH (T4) ─FAIL→ dừng, ghi report
  → đưa về cùng hệ + canh khít không dùng die-line (T5) ─FAIL→ dừng, ghi report
  → đo độ khít (T6) → ghi report.json + bộ ảnh kết quả
```

**Mã thoát:** `0` PASS · `2` FIT_FAIL · `3` SIZE/ASPECT FAIL · `4` FRAME_NOT_CONFIRMED · `1` lỗi khác (vd: `PAGE_OUT_OF_RANGE`).

---

## 8. Bộ test với file thật (`brand.pdf` & `vendor.pdf`)

| Case | Input | Tham số | Kỳ vọng |
|---|---|---|---|
| **R0** | `brand.pdf` vs `brand.pdf` | `--size-mm 620x250 --brand-page 1 --vendor-page 1` | `PASS`, heatmap đen toàn bộ |
| **R1** | `vendor.pdf` vs `vendor.pdf` | `--size-mm 620x250 --brand-page 1 --vendor-page 1` | `PASS`, chỉ dùng trang 1 của `vendor.pdf` (không đụng tới trang 2) |
| **R2** | `brand.pdf` vs `vendor.pdf` | `--size-mm 620x250 --brand-page 1 --vendor-page 1` | So sánh phương án Vector vs Raster ở cả 2 file; chồng khít 2 bản; trên `overlay.png` và `absdiff_heatmap.png` làm nổi bật đúng các chỗ sửa nội dung (như dòng *"Sản phẩm có chứa đậu nành, sữa."*) |

---

## 9. Definition of Done – Phase 1

- [x] Task 1–7 có unit test độc lập, `pytest` xanh 100%.
- [x] R0, R1 PASS (chỉ dùng trang 1, không dùng trang 2 của `vendor.pdf`).
- [x] R2 chạy hết luồng, xuất đủ `report.json`, `frame_brand.png`, `frame_vendor.png`, `overlay.png`, `absdiff_heatmap.png`, `grid_shift.png`.
- [x] `PHASE1_FINDINGS.md` ghi lại kết quả thực nghiệm:
  - `TrimBox` / `OCG` / `Vector drawings` có gì trong `brand.pdf` và `vendor.pdf`.
  - **Bảng so sánh chi tiết Phương án 1 (`pdf_vector`) vs Phương án 2 (`opencv_raster`)** trên cả 2 file (tọa độ tìm được, độ lệch so với `620 × 250 mm`, thời gian chạy, ưu/nhược điểm).
  - Độ lệch thực tế giữa `brand.pdf` và `vendor.pdf` (dịch / scale / xoay) và đánh giá chất lượng canh khít không dùng die-line.
- [x] Không có code nào thuộc phạm vi so chữ / màu / hình của Phase sau.
