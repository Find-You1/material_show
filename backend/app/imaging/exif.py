"""EXIF 提取。只取对素材站有意义的拍摄参数。"""

from typing import Any

# EXIF 标签号
_TAG_MAKE = 0x010F
_TAG_MODEL = 0x0110
_TAG_SOFTWARE = 0x0131
_EXIF_IFD = 0x8769
_TAG_EXPOSURE_TIME = 0x829A
_TAG_FNUMBER = 0x829D
_TAG_ISO = 0x8827
_TAG_DATETIME_ORIGINAL = 0x9003
_TAG_FOCAL_LENGTH = 0x920A
_TAG_FOCAL_35MM = 0xA405
_TAG_LENS_MODEL = 0xA434


def _fmt_exposure(value: Any) -> str | None:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if num <= 0:
        return None
    if num >= 1:
        return f"{num:g}s"
    return f"1/{round(1 / num)}s"


def _fmt_fnumber(value: Any) -> str | None:
    try:
        return f"f/{float(value):g}"
    except (TypeError, ValueError):
        return None


def _fmt_focal(value: Any) -> str | None:
    try:
        return f"{float(value):g}mm"
    except (TypeError, ValueError):
        return None


def _clean(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").strip("\x00").strip()
    if isinstance(value, str):
        return value.strip("\x00").strip()
    return value


def extract_exif(img) -> dict | None:
    """从已打开的 Pillow 图片提取拍摄参数，取不到就返回 None。"""
    try:
        exif = img.getexif()
    except Exception:  # noqa: BLE001
        return None
    if not exif:
        return None

    data: dict[str, Any] = {}

    make = _clean(exif.get(_TAG_MAKE))
    model = _clean(exif.get(_TAG_MODEL))
    if make or model:
        data["camera"] = " ".join(x for x in (make, model) if x)

    software = _clean(exif.get(_TAG_SOFTWARE))
    if software:
        data["software"] = software

    try:
        ifd = exif.get_ifd(_EXIF_IFD)
    except Exception:  # noqa: BLE001
        ifd = {}

    if ifd:
        iso = _clean(ifd.get(_TAG_ISO))
        if iso:
            data["iso"] = iso

        aperture = _fmt_fnumber(ifd.get(_TAG_FNUMBER))
        if aperture:
            data["aperture"] = aperture

        shutter = _fmt_exposure(ifd.get(_TAG_EXPOSURE_TIME))
        if shutter:
            data["shutter"] = shutter

        focal = _fmt_focal(ifd.get(_TAG_FOCAL_LENGTH))
        if focal:
            data["focal_length"] = focal

        focal_35 = _fmt_focal(ifd.get(_TAG_FOCAL_35MM))
        if focal_35:
            data["focal_length_35mm"] = focal_35

        lens = _clean(ifd.get(_TAG_LENS_MODEL))
        if lens:
            data["lens"] = lens

        taken = _clean(ifd.get(_TAG_DATETIME_ORIGINAL))
        if taken:
            data["taken_at"] = taken

    return data or None