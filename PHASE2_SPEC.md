# ARTDIFF – PHASE 2: Tìm & khoanh vùng khác biệt

> Spec cho coding agent. **Chỉ làm đúng phạm vi Phase 2.** Không làm so màu (ΔE), barcode, OCR, phân loại chữ/hình, UI.
> Làm theo từng Task, **test xong Task này mới sang Task sau**. Không generate cả phase một lần.

---

## 0. Bối cảnh

- Phase 1 đã xong: từ 2 file PDF (Brand / Vendor) → tìm khung thiết kế bằng vector (`pdf_vector`) → render cùng hệ → canh khít cả trang (Shi-Tomasi + LK + RANSAC + Masked ECC).
- Phase 2 nhận đầu ra Phase 1 và trả lời câu hỏi: **chỗ nào khác nhau?** → danh sách vùng có tọa độ mm.

### Phát hiện từ Phase 1 ảnh hưởng tới Phase 2
- **Lệch cục bộ có thật:** ở cặp brand/vendor, ảnh ly cà phê lệch riêng ~2 px (~0,17 mm) so với khối chữ; 7/40 ô lưới vượt 1 px. → Một phép canh chung cả trang **không đủ**, cần canh lại cục bộ.
- Cả 4 file thật đều không có TrimBox / CropBox / OCG.
- Đã có **đáp án biết trước** cho 2 cặp file thật (xem mục 7).

### Quyết định đã chốt
- **D1.** Đối tượng bị dời vị trí → **vẫn báo**, gắn cờ `shift_only = true` để phase sau lọc được.
- **D2.** Ngưỡng dời coi là "sửa thật": **0,25 mm** (≈ 3 px @300 DPI). Dời ≤ ngưỡng → canh lại cục bộ rồi so tiếp. Dời > ngưỡng → **không canh**, báo `moved`. Là tham số trong profile, chỉnh sau khi chạy.

---

## 1. Phạm vi

**Trong phạm vi**
1. Bộ test tổng hợp + script chấm điểm.
2. So pixel có chống răng cưa + dung sai lân cận.
3. Gom vùng, đánh số, xuất `diff.json` + ảnh khoanh.
4. Canh lại cục bộ theo lưới.
5. Canh lại cục bộ theo đối tượng PDF (chỉ làm nếu Task 4 chưa đủ – xem mục 6).
6. Mask bỏ qua do user khai báo (mm).

**Ngoài phạm vi (KHÔNG làm)**
- So màu, barcode, OCR, phân loại "chữ / hình / nghi lỗi font", UI web.
- Sửa các điểm còn tồn của Phase 1 (gate PASS 3 trạng thái, stable_mask…) – **để nguyên**, không đụng.

---

## 2. Đầu vào / Đầu ra

**Đầu vào** (từ `out/<run_id>/` của Phase 1):
- `A.png` (Artboard brand), `B_aligned.png` (vendor đã canh), `valid_mask.png`
- `report.json` Phase 1 (px_per_mm, transform, frame mm)
- 2 file PDF gốc (cho Task 5 – đọc đối tượng)

> Nếu Phase 1 chưa lưu `A.png` / `B_aligned.png` dạng lossless thì **thêm bước lưu PNG** vào cuối pipeline Phase 1. Đây là thay đổi duy nhất được phép trên code Phase 1.

**Đầu ra** (`out/<run_id>/phase2/`):
- `diff.json` – danh sách vùng (schema mục 4)
- `overlay_boxes.png` – A mờ + box đánh số (màu theo loại)
- `diff_mask.png` – mask pixel khác (sau lọc)
- `local_shift.png` – bản đồ độ dịch cục bộ đã áp
- `phase2_report.json` – tham số, thời gian, thống kê

---

## 3. Nguyên tắc (bắt buộc)

1. **Đơn vị chuẩn mm.** Mọi bbox xuất ra đều có `bbox_mm`; `bbox_px` chỉ là phụ.
2. **Recall trước, precision sau.** Bỏ sót đắt hơn báo dư. Không được tăng lọc nhiễu đến mức làm mất lỗi đã biết.
3. **Không lọc theo diện tích quá mạnh.** Lỗi 1 dấu chấm/phẩy chỉ vài chục px.
4. **Mọi phép canh cục bộ có giới hạn** (D2). Không bao giờ "kéo cho khớp" một thứ dời quá ngưỡng.
5. **Mọi ngưỡng nằm trong profile**, không hard-code.
6. **Đo bằng số**: mọi Task sau Task 1 phải chạy script chấm điểm và ghi kết quả so với baseline.

---

## 4. Hợp đồng dữ liệu

```python
@dataclass
class DiffRegion:
    id: int                         # đánh số trên→dưới, trái→phải
    bbox_mm: tuple[float, float, float, float]   # x, y, w, h trong hệ Artboard
    bbox_px: tuple[int, int, int, int]
    diff_pixels: int
    kind: str                       # "content" | "shift_only" | "moved"
    shift_only: bool                # D1
    local_shift_mm: tuple[float, float] | None   # độ dịch cục bộ đã áp / đo được
    source: str                     # "grid" | "object:<id>" | "none"
    score: float                    # mức tin cậy 0..1

@dataclass
class PdfObject:
    id: str
    side: str                       # "A" | "B"
    type: str                       # "image" | "vector_group"
    bbox_mm: tuple[float, float, float, float]

@dataclass
class ObjectMatch:
    a_id: str
    b_id: str
    shift_mm: tuple[float, float]
    scale: float
    moved: bool                     # |shift| > move_threshold_mm
```

**Định nghĩa `kind`:**
- `content` – khác nội dung sau khi đã canh cục bộ.
- `shift_only` – chỉ khác do lệch ≤ ngưỡng; sau canh cục bộ thì hết khác, nhưng **vẫn báo** (D1).
- `moved` – đối tượng dời > `move_threshold_mm`; báo kèm độ dời.

---

## 5. Profile – bổ sung khối `phase2`

```yaml
phase2:
  pixelmatch_threshold: 0.1        # điểm xuất phát
  include_aa: false                # false = bỏ qua anti-aliasing
  neighbor_radius_px: 1
  dilate_px: 6                     # gộp ký tự cùng dòng
  min_area_px: 4
  merge_gap_px: 4                  # gộp box sát nhau
  local_align:
    grid_cell_mm: 20
    grid_overlap: 0.5
    max_local_shift_px: 3          # = move_threshold_mm * px_per_mm
    min_texture_std: 4.0           # ô quá trơn → không canh
  move_threshold_mm: 0.25          # D2
  shift_only_min_shift_px: 0.5     # dịch nhỏ hơn mức này coi như không dịch
  ignore_zones_mm: []              # [{bbox_mm: [x,y,w,h], reason: "..."}]
```

> Mọi con số là **điểm xuất phát**, chốt lại ở Task 6.

---

## 6. Các Task

> Mỗi Task: **Mục đích → Việc cần làm → Đầu ra → Test / tiêu chí xong.**

### Task 1 – Bộ test tổng hợp + script chấm điểm (`tests/synth/`, `artdiff/eval/`)
**Mục đích:** có thước đo trước khi viết thuật toán; tránh chỉnh ngưỡng "học thuộc" 2 cặp file thật.

**Việc cần làm**
- `make_synthetic.py`: từ một PDF gốc, dùng PyMuPDF tạo bản sửa **biết trước tọa độ**:
  1. Xóa 1 ký tự có dấu (redact + chèn lại text thiếu ký tự, hoặc che 1 glyph bằng nền).
  2. Đổi 1 chữ số (vd. `320` → `326`).
  3. Xóa 1 dấu `%` hoặc `,`.
  4. Dời 1 logo / ảnh **0,15 mm** (dưới ngưỡng → kỳ vọng `shift_only`).
  5. Dời 1 logo / ảnh **0,5 mm** (trên ngưỡng → kỳ vọng `moved`).
  6. Thêm 1 dòng chữ mới.
  7. Bản **không sửa gì** (kỳ vọng 0 vùng).
- Mỗi bản sinh kèm `truth.json`: `[{bbox_mm, expected_kind, note}]`.
- `eval.py`: so `diff.json` với `truth.json`:
  - Ghép cặp theo IoU ≥ 0.1 **hoặc** tâm truth nằm trong box dự đoán (box chữ nhỏ thì IoU thấp là bình thường).
  - Báo: **recall**, **số vùng dư (false positive)**, **đúng `kind`**, IoU trung bình.
- Ghi thêm `truth.json` thủ công cho 2 cặp thật (mục 7).

**Test:** `eval.py` chạy được trên `diff.json` giả lập; cho đúng recall/FP trên case dựng tay.

---

### Task 2 – So pixel baseline (`artdiff/compare/pixel_diff.py`)
**Mục đích:** có mask khác biệt "thô" và số liệu baseline, **chưa** canh cục bộ.

**Việc cần làm**
- `pixel_diff(A, B, valid_mask, profile) -> diff_mask`
  - pixelmatch (bản Python) với `threshold`, `include_aa` từ profile.
  - **Dung sai lân cận:** pixel `p` ở A chỉ tính khác nếu **không có** pixel nào trong cửa sổ `(2r+1)²` quanh `p` ở B có màu khớp (theo cùng metric/threshold); và ngược lại B→A. Hợp 2 chiều = diff.
    - Gợi ý hiện thực nhanh: so A với các bản B dịch `(dx,dy) ∈ [-r..r]²`, lấy **min** sai khác theo từng pixel.
  - Áp `valid_mask` và `ignore_zones_mm`.

**Test**
- A vs A → mask rỗng.
- A vs A dịch 1 px, `r=1` → mask rỗng; `r=0` → có viền.
- Chạy `eval.py` trên bộ tổng hợp + 2 cặp thật → lưu **baseline** vào `PHASE2_FINDINGS.md`.

---

### Task 3 – Gom vùng (`artdiff/aggregate/regions.py`)
**Mục đích:** biến pixel lẻ thành danh sách vùng để người duyệt đi qua từng mục.

**Việc cần làm**
- `extract_regions(diff_mask, px_per_mm, profile) -> list[DiffRegion]`
  - Dilate `dilate_px` → connected components → bbox.
  - Bỏ component < `min_area_px` (đo trên mask **trước** dilate).
  - Gộp box cách nhau < `merge_gap_px`.
  - Sắp xếp trên→dưới, trái→phải (theo hàng, dung sai hàng = chiều cao box trung vị), đánh `id` từ 1.
  - Ở Task này `kind="content"`, `source="none"`.
- Xuất `diff.json`, `overlay_boxes.png`, `diff_mask.png`.

**Test**
- Mask tổng hợp 3 cụm → 3 box đúng thứ tự.
- 1 dấu chấm (≈ 3×3 px) **không bị loại**.
- Chạy lại `eval.py` → ghi số so với baseline.

> **Mốc kiểm tra sau Task 3:** nộp `PHASE2_FINDINGS.md` bản tạm với baseline. Nếu ảnh ly cà phê ở R2 bị khoanh cả mảng → đúng như dự đoán, sang Task 4.

---

### Task 4 – Canh lại cục bộ theo lưới (`artdiff/compare/local_align.py`)
**Mục đích:** khử lệch cục bộ nhỏ (kiểu ảnh ly lệch 2 px) để không khoanh nhầm cả mảng.

**Việc cần làm**
- Chia Artboard thành ô `grid_cell_mm`, chồng mí `grid_overlap`.
- Mỗi ô:
  - Ô quá trơn (`std < min_texture_std`) → bỏ qua, shift = 0.
  - Đo shift (dx, dy) bằng `cv2.phaseCorrelate` (có cửa sổ Hanning), ảnh xám.
  - `|shift| ≤ max_local_shift_px` → chấp nhận.
  - `|shift| > max_local_shift_px` → **không áp**, đánh dấu ô `moved_candidate`.
- Nội suy trường dịch mượt giữa các ô (bilinear trên lưới tâm ô) → `cv2.remap` B → `B_local`.
- Chạy lại `pixel_diff(A, B_local)` → `diff_after`.
- **Gán `kind` cho từng vùng:**
  - Vùng có trong `diff_before` nhưng **mất** trong `diff_after`, và shift cục bộ ≥ `shift_only_min_shift_px` → `shift_only` (D1, vẫn báo).
  - Vùng còn trong `diff_after` → `content`.
  - Vùng nằm trong ô `moved_candidate` → `moved`, kèm `local_shift_mm`.
- Xuất `local_shift.png` (mũi tên / màu theo độ lớn).

**Test**
- B = A với 1 mảng dịch (1.5, -1.0) px → sau canh: mảng đó **không còn** `content`, có đúng 1 vùng `shift_only`.
- Mảng dịch 6 px (> 3 px) → vùng `moved`, không bị canh.
- Mảng dịch 1.5 px **và** đổi 1 ký tự bên trong → vẫn có vùng `content` tại ký tự đó (canh cục bộ không được "nuốt" lỗi thật).
- Chạy `eval.py` → ghi số so với Task 3.

---

### Task 5 – Canh theo đối tượng PDF (`artdiff/ingest/pdf_objects.py`) — **CÓ ĐIỀU KIỆN**
**Mục đích:** canh chính xác theo đúng biên đối tượng (ảnh bitmap, khối vector), thay vì theo ô lưới cắt ngang đối tượng.

**Chỉ làm Task này nếu** sau Task 4 còn **một trong**:
- Recall < 100% trên bộ tổng hợp hoặc 2 cặp thật, **hoặc**
- Còn vùng dư nằm dọc biên đối tượng (ô lưới cắt ngang đối tượng bị dời).

Nếu không → **bỏ qua, ghi lý do vào findings** (tránh over-engineering).

**Việc cần làm (nếu làm)**
- Đọc bbox ảnh bitmap (`page.get_image_info()` / `get_image_rects`) và nhóm vector lớn (`get_drawings`, gom theo bbox chồng nhau) ở cả 2 file → đổi sang hệ mm của Artboard (trừ gốc frame Phase 1, áp transform Phase 1 cho B).
- Ghép cặp A↔B theo: cùng loại, IoU cao nhất, kích thước gần nhau (sai < 2%).
- Với mỗi cặp: `shift_mm` = chênh tâm; `moved = |shift_mm| > move_threshold_mm`.
- Đối tượng không `moved`: canh riêng vùng đó (phase correlation trong bbox, đối chiếu với `shift_mm` từ PDF; nếu chênh > 1 px → tin số đo ảnh, ghi cảnh báo).
- Ưu tiên kết quả đối tượng hơn kết quả lưới trong bbox đối tượng; `source="object:<id>"`.
- Đối tượng có ở A mà không có ở B (hoặc ngược lại) → vùng `content` với note `object_added` / `object_removed`.

**Test**
- PDF tổng hợp (Task 1, case 4 và 5): đo `shift_mm` sai < 0,02 mm so với truth.
- R2: ảnh ly cà phê được ghép cặp, shift ≈ 0,17 mm, **không bị khoanh cả mảng**.
- Chạy `eval.py` → ghi số so với Task 4.

---

### Task 6 – Chỉnh ngưỡng, chốt profile, CLI (`artdiff/pipeline_phase2.py`)
**Mục đích:** chốt bộ tham số dựa trên số, chạy được bằng 1 lệnh.

**Việc cần làm**
- Script quét tham số (`pixelmatch_threshold`, `neighbor_radius_px`, `dilate_px`, `min_area_px`) trên bộ tổng hợp + 2 cặp thật.
- Chọn bộ **giữ recall = 100%** mà có **FP thấp nhất**. Ghi bảng quét vào findings.
- CLI:
```
python -m artdiff.pipeline_phase2 \
  --phase1-run out/R2_brand_vs_vendor \
  --brand brand.pdf --vendor vendor.pdf \
  --profile profiles/default.yaml \
  [--ignore-zones zones.yaml]
```
- Mã thoát: `0` chạy xong · `5` thiếu đầu vào Phase 1 · `1` lỗi khác.

---

## 7. Đáp án biết trước cho file thật (`tests/fixtures/real/*/truth.json`)

> Agent điền `bbox_mm` bằng cách đo trên ảnh Phase 1, **người review xác nhận** trước khi dùng để chấm.

**v1 vs v2 (217 × 200,5 mm)** – kỳ vọng 5 vùng `content`:
1. Thành phần (VN), dòng 4: mất "ỉ" trong "chỉnh".
2. Hướng dẫn sử dụng (VN), dòng cuối: mất "á" trong "rách".
3. Bảng dinh dưỡng, Carbohydrat: mất "%" sau "19".
4. Bảng dinh dưỡng, Chất béo bão hòa: mất ",4" trong "12,4".
5. Đoạn MY/ID: "Saderi" / "Seledri".

**brand vs vendor (620 × 250 mm):**
1. Thành phần: thêm dòng "Sản phẩm có chứa đậu nành, sữa." → `content`.
2. Logo nhỏ MacCoffee + "CÀ PHÊ ĐEN HÒA TAN" mặt phải: dời dọc → `shift_only` hoặc `moved` tùy độ dời đo được.
3. Vùng barcode: brand trống, vendor có mã → `content`.
4. Ảnh ly cà phê: lệch ~0,17 mm → `shift_only`, **không** `content` cả mảng.

> Các vùng khác mà tool tìm ra ngoài danh sách này: **không tự coi là FP**. Ghi vào findings mục "chưa phân xử" để người review xem bằng mắt rồi cập nhật truth.

---

## 8. Definition of Done – Phase 2

- [ ] Task 1–4, 6 có unit test, `pytest` xanh. Task 5 làm hoặc có lý do bỏ qua.
- [ ] R0, R1, bản tổng hợp "không sửa": **0 vùng**.
- [ ] Bộ tổng hợp: **recall 100%**, `kind` đúng cho case dời 0,15 mm (`shift_only`) và 0,5 mm (`moved`).
- [ ] v1 vs v2: **bắt đủ 5/5**.
- [ ] brand vs vendor: bắt đủ mục 1, 3; mục 2 có vùng với `kind` hợp lý; **ảnh ly không bị khoanh `content` cả mảng**.
- [ ] `PHASE2_FINDINGS.md` gồm:
  - Bảng số theo từng Task: baseline → Task 3 → Task 4 → (Task 5) → chốt (recall, FP, IoU, thời gian).
  - Bộ tham số đã chốt + bảng quét.
  - Danh sách vùng "chưa phân xử" trên 2 cặp thật.
  - Task 5 làm hay bỏ, vì sao.
  - Các giả định bị sai (nếu có).
- [ ] Đường dẫn trong báo cáo là **tương đối trong repo**, không dùng `file:///Users/...`.
- [ ] Không có code thuộc phạm vi so màu / barcode / OCR / UI.

---

## 9. Lưu ý cho agent

- Làm **Task theo thứ tự**, mỗi Task commit riêng, chạy `pytest` + `eval.py` trước khi sang Task sau.
- **Không được giảm recall để giảm FP.** Nếu phải đánh đổi → dừng, ghi vào findings, hỏi lại.
- Nếu phát hiện giả định sai (vd. PyMuPDF không đọc được bbox ảnh trong file vendor, lệch cục bộ > 3 px ở nhiều chỗ) → **dừng, ghi findings, hỏi lại**, không tự đổi thiết kế.
- Không sửa code Phase 1 ngoài việc lưu PNG đầu ra (mục 2).
- Ngưỡng là tham số trong profile, **không hard-code**.
