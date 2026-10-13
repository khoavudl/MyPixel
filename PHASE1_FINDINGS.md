# BÁO CÁO TỔNG KẾT PHASE 1 – ARTDIFF (Chọn vùng · Đưa về cùng hệ · Chồng khít)

## 1. Tóm tắt Mục tiêu & Kiến trúc đã triển khai

Phase 1 giải quyết bài toán nền tảng trước khi so sánh nội dung: **Từ 2 file PDF bất kỳ của Brand và Vendor/Supplier (khác nguồn xuất, khác độ phân giải, khác bố cục trang, không cố định kích thước và số trang) → tìm đúng vùng thiết kế `W × H` (mm) → đưa về cùng hệ phân giải từ vector → chồng khít tới mức sub-pixel (< 0.5 px) mà không phụ thuộc vào die-line.**

### Các thay đổi thiết kế quan trọng đã áp dụng:
1. **Kích thước động (`--size-mm WxH`):** Không fix cứng `620 × 250 mm` trong profile. User truyền trực tiếp kích thước mục tiêu `W × H` (mm) của mẫu thiết kế (ví dụ: `620x250`, `217x200.5`, `420x180`...).
2. **Số trang linh hoạt (`--brand-page`, `--vendor-page`, mặc định trang 1):** Hỗ trợ file Supplier có 1 trang hoặc nhiều trang bất kỳ, không phụ thuộc vào trang 2 (`frame_hint` / trang die-line riêng).
3. **Loại bỏ hoàn toàn sự phụ thuộc vào Die-line:**
   - **Ở bước tìm khung (Task 2):** Chạy song song và đối chiếu 2 phương án độc lập là **`pdf_vector`** (đọc vector path/panel từ `PyMuPDF`) và **`opencv_raster`** (dò cạnh/contour/tích phân gradient từ ảnh xám).
   - **Ở bước canh khít (Task 5):** Dùng lưới góc **Shi-Tomasi sub-pixel + Pyramidal Lucas-Kanade + RANSAC** trên toàn bộ thiết kế kết hợp **Masked ECC** (tự động che vùng có biến động nội dung lớn để không bị kéo lệch phép canh).

---

## 2. Kết quả Kiểm thử Tự động (`pytest`)

Toàn bộ **24/24 unit & integration tests** qua 7 Task đều **PASS 100%**:
- [test_units.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_units.py): Quy đổi chính xác hai chiều `mm ↔ pt ↔ px`, tính `zoom` từ DPI / `px_per_mm`.
- [test_pdf_renderer.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_pdf_renderer.py) (Task 1): Render chuẩn kích thước `±1 px`, 2 lần render `byte-equal`, kiểm tra bắt lỗi `PAGE_OUT_OF_RANGE`.
- [test_frame_detector.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_frame_detector.py) (Task 2): Tìm khung với kích thước tuỳ biến (`420 × 180 mm`, `620 × 250 mm`) có bảng ký duyệt/màu gây nhiễu bên dưới; trả về `manual` an toàn khi trang trắng.
- [test_cropper.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_cropper.py) (Task 3): Xác nhận khung (`auto` / `interactive`) và cắt `Artboard`.
- [test_size_gate.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_size_gate.py) (Task 4): Kiểm tra đủ 4 trạng thái `PASS`, `SCALED_FILE`, `ASPECT_MISMATCH`, `SIZE_MISMATCH`.
- [test_aligner.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_aligner.py) (Task 5): Kiểm tra độ chính xác sub-pixel (`< 0.5 px`) khi ảnh bị dịch `(3.4, -2.1) px` + scale `1.003` + xoay `0.1°`, và chứng minh phép canh không bị kéo lệch (`< 0.25 px`) khi có cả một mảng nội dung lớn bị sửa.
- [test_fit_meter.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_fit_meter.py) (Task 6): Kiểm tra lưới `10 × 4` bằng `phaseCorrelate` và bộ 3 ảnh chẩn đoán.
- [test_pipeline_phase1.py](file:///Users/tindn/Documents/Code/MyPixel/tests/test_pipeline_phase1.py) (Task 7): Kiểm tra trọn luồng CLI với file nhiều trang và khổ tuỳ chỉnh.

---

## 3. Phân tích & So sánh Thực nghiệm trên 2 Bộ File Thực Tế

### 3.1. Thông tin cấu trúc PDF đầu vào

| Thuộc tính | Bộ 1: `brand.pdf` | Bộ 1: `vendor.pdf` | Bộ 2: `v1.pdf` (Kracks) | Bộ 2: `v2.pdf` (Kracks) |
|---|---|---|---|---|
| **Khổ thiết kế mục tiêu (`W × H`)** | `620.0 × 250.0 mm` | `620.0 × 250.0 mm` | `217.0 × 200.5 mm` | `217.0 × 200.5 mm` |
| **Số trang PDF (Trang sử dụng)** | 1 (Trang 1) | 2 (Chỉ dùng Trang 1) | 1 (Trang 1) | 1 (Trang 1) |
| **Kích thước trang (`MediaBox`)** | `684.86 × 291.77 mm` | `670.22 × 326.59 mm` | `321.73 × 257.44 mm` | `321.73 × 257.44 mm` |
| **`TrimBox` / `CropBox` / `OCG`** | `None` / `None` / `[]` | `None` / `None` / `[]` | `None` / `None` / `[]` | `None` / `None` / `[]` |
| **Số ứng viên Vector trích xuất** | `424` | `569` | `67` | `66` |

> **Kết luận về G3 (`TrimBox` / `OCG`):** Cả 4 file thực tế đều **không có `TrimBox`, không có `CropBox` riêng và không có layer `OCG`**. Do đó không thể dựa vào `TrimBox` hay tắt bật layer `OCG` mà bắt buộc phải dùng thuật toán dò khung ở Task 2.

---

### 3.2. Đối chiếu Phương án 1 (`pdf_vector`) vs Phương án 2 (`opencv_raster`) ở Task 2

| File | Phương án 1: `pdf_vector` (Tọa độ `mm` · Sai số · Thời gian) | Phương án 2: `opencv_raster` (Tọa độ `mm` · Sai số · Thời gian) | Nhận xét thực tế |
|---|---|---|---|
| **`brand.pdf`**<br>(`620×250`) | `(49.64, 24.34, 619.96, 250.01)`<br>Sai số: **`0.038 × 0.013 mm`** · **`0.31 ms`** | `(49.61, 24.30, 619.93, 250.02)`<br>Sai số: `0.069 × 0.021 mm` · `354.91 ms` | Cả 2 đều bắt rất sát. `pdf_vector` ghép chính xác 2 panel `310×250 mm` liền kề và bỏ qua lớp kích thước xanh bị nghiêng `0.115°`. |
| **`vendor.pdf`**<br>(`620×250`) | `(34.96, 24.36, 620.00, 250.00)`<br>Sai số: **`0.000 × 0.0001 mm`** · **`0.57 ms`** | `(34.80, 24.13, 620.27, 250.36)`<br>Sai số: `0.269 × 0.360 mm` · `398.41 ms` | `pdf_vector` chính xác tuyệt đối `0.000 mm`. `opencv_raster` bị cộng thêm độ dày nét vẽ viền tím (`~0.3 mm` ≈ 3–4 px). |
| **`v1.pdf`**<br>(`217×200.5`) | `(42.28, 38.71, 217.00, 200.50)`<br>Sai số: **`0.000 × 0.0002 mm`** · **`0.16 ms`** | `(51.82, 38.52, 216.49, 200.58)`<br>Sai số: `0.507 × 0.076 mm` · `151.06 ms` | Trên `v1.pdf`, nền nâu tràn ra cả phần lề `10mm no wording` (trái) và `3mm no wording` (phải). `opencv_raster` bị hút sang mép phải của lề tràn (`+9.5 mm`), còn **`pdf_vector` bắt trúng tuyệt đối khung `217 × 200.5 mm`**. |
| **`v2.pdf`**<br>(`217×200.5`) | `(42.28, 38.71, 217.00, 200.50)`<br>Sai số: **`0.000 × 0.0002 mm`** · **`0.12 ms`** | `(42.42, 38.52, 216.66, 200.49)`<br>Sai số: `0.338 × 0.009 mm` · `120.32 ms` | `pdf_vector` đạt sai số `0.000 mm` trong `0.12 ms`. |

**Đánh giá tổng kết Task 2:**
- **Phương án 1 (`pdf_vector`) là phương án chủ lực tốt nhất:** Nhanh hơn **~600–1000 lần** (`< 0.6 ms` so với `150–400 ms`), sai số kích thước gần như bằng **0 (`0.000 – 0.038 mm`)**, và không bị đánh lừa bởi độ dày nét vẽ hay vùng nền tràn lề (`no wording` / bleed).
- **Phương án 2 (`opencv_raster`) giữ làm phương án dự phòng (fallback):** Khi gặp file PDF bị flatten hoàn toàn thành 1 ảnh scan/bitmap duy nhất không còn đối tượng vector, `opencv_raster` sẽ tự động đảm nhận.

---

### 3.3. Kết quả Canh khít (Task 5) & Đo độ khít (Task 6)

| Chỉ số | `R0`: `brand` vs `brand` | `R1`: `vendor` vs `vendor` | `R2`: `brand` vs `vendor` (`620×250`) | `v1` vs `v2` (`217×200.5`) |
|---|---|---|---|---|
| **Trạng thái (`status`)** | **PASS (`0`)** | **PASS (`0`)** | **PASS (`0`)** | **PASS (`0`)** |
| **Kích thước ảnh Crop (@300 DPI)** | `7322 × 2953 px` | `7323 × 2953 px` | `7322 × 2953 px` | `2563 × 2368 px` |
| **Số điểm khớp RANSAC (`inliers`)** | `754` | `742` | `658` | `941` |
| **Sai số khớp (`inlier_rmse_px`)** | `0.0000 px` | `0.0000 px` | **`0.2556 px`** | **`0.3403 px`** |
| **Tỉ lệ vùng ổn định (`stable_mask`)** | `96.0%` | `96.0%` | `70.0%` | `85.0%` |
| **Độ lệch lưới ở vùng không sửa** | `0.00 px` | `0.00 px` | **`0.02 – 0.15 px`** | **`0.02 – 0.39 px`** |
| **Số ô lưới vượt ngưỡng `1.0 px`** | `0 / 40` | `0 / 40` | `7 / 40` (vùng ảnh ly cà phê bên trái lệch cục bộ `~2 px`) | **`0 / 40`** (tất cả 40 ô đều `< 0.86 px`) |

---

### 3.4. Những khác biệt nội dung đã phát hiện nhờ chồng khít Phase 1

1. **Trên cặp `brand.pdf` vs `vendor.pdf` (`out/R2_brand_vs_vendor/`):**
   - **Mục THÀNH PHẦN (góc trên phải):** `vendor.pdf` thêm dòng chữ đậm ***"Sản phẩm có chứa đậu nành, sữa."*** đẩy phần text cảnh báo dị ứng dịch sang phải.
   - **Logo nhỏ `"MacCoffee"` & dòng `"CÀ PHÊ ĐEN HÒA TAN"` (bên phải):** Bị dịch vị trí theo chiều dọc giữa 2 bản.
   - **Vùng Barcode (`893 6024 244194`):** `brand.pdf` là ô trắng trống, `vendor.pdf` đã chèn mã vạch.
   - **Hình chụp ly cà phê (nửa trái):** Tấm ảnh bitmap ly cà phê được đặt lệch tương đối `~2.0 px` (`~0.17 mm`) so với khung chữ bên phải giữa 2 file.

2. **Trên cặp `v1.pdf` vs `v2.pdf` (`out/v1_vs_v2/`):**
   Dù mắt thường nhìn qua gần như giống hệt nhau, ảnh `absdiff_heatmap.png` và `overlay.png` sau khi chồng khít tới `0.02 – 0.08 px` đã chỉ ra chính xác **5 lỗi mất/sửa ký tự siêu nhỏ**:
   - **Đoạn Tiếng Việt – Thành phần (dòng 4):** `"chất điều chỉnh độ acid"` → ở `v2.pdf` bị **mất chữ `"ỉ"`** thành `"chất điều ch nh độ acid"`.
   - **Đoạn Tiếng Việt – Hướng dẫn sử dụng (dòng cuối):** `"hoặc khi lon bị rách."` → ở `v2.pdf` bị **mất chữ `"á"`** thành `"hoặc khi lon bị r ch."`.
   - **Bảng Dinh Dưỡng – Dòng `Carbohydrat`:** `"19 %"` ở `v1.pdf` → ở `v2.pdf` bị **mất ký hiệu `"%"`** (chỉ còn `"19"`).
   - **Bảng Dinh Dưỡng – Dòng `Chất béo bão hòa`:** `"12,4"` ở `v1.pdf` → ở `v2.pdf` bị **mất phần thập phân `",4"`** (chỉ còn `"12"`).
   - **Đoạn Tiếng Mã Lai / Indonesia (`MY`/`ID`):** Khác biệt từ `"Saderi"` / `"Seledri"` ở dòng cuối.

---

## 4. Hướng dẫn chạy lệnh CLI (Task 7)

```bash
# Chạy cặp brand.pdf vs vendor.pdf (Khổ 620 x 250 mm, trang 1)
.venv/bin/python -m artdiff.pipeline_phase1 \
  --brand brand.pdf \
  --vendor vendor.pdf \
  --size-mm 620x250 \
  --brand-page 1 \
  --vendor-page 1 \
  --mode auto \
  --out out \
  --run-id R2_brand_vs_vendor

# Chạy cặp v1.pdf vs v2.pdf (Khổ 217 x 200.5 mm, trang 1)
.venv/bin/python -m artdiff.pipeline_phase1 \
  --brand v1.pdf \
  --vendor v2.pdf \
  --size-mm 217x200.5 \
  --brand-page 1 \
  --vendor-page 1 \
  --mode auto \
  --out out \
  --run-id v1_vs_v2
```
