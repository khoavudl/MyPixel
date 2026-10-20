# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import os
import sys

block_cipher = None

ROOT_DIR = os.path.abspath(SPECPATH)

datas = [
    (os.path.join(ROOT_DIR, "ui", "dist"), os.path.join("ui", "dist")),
    (os.path.join(ROOT_DIR, "artdiff", "profiles"), os.path.join("artdiff", "profiles")),
    (os.path.join(ROOT_DIR, "Logo-fes.png"), "."),
    (os.path.join(ROOT_DIR, "assets"), "assets"),
]

hiddenimports = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespans",
    "uvicorn.lifespans.on",
    "uvicorn.lifespans.off",
    "websockets",
    "websockets.legacy",
    "websockets.legacy.server",
    "fitz",
    "cv2",
    "numpy",
    "PIL",
    "PIL.Image",
    "docx",
    "reportlab",
    "pydantic",
    "pydantic_core",
    "multipart",
    "python_multipart",
    "webview",
    "webview.platforms.cocoa",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
]

binaries = []

if sys.platform == "win32":
    hiddenimports += ["clr", "clr_loader", "pythonnet", "cffi"]
    try:
        from PyInstaller.utils.hooks import collect_all
        for pkg in ("pythonnet", "clr_loader"):
            pkg_datas, pkg_binaries, pkg_hiddenimports = collect_all(pkg)
            datas += pkg_datas
            binaries += pkg_binaries
            hiddenimports += pkg_hiddenimports
    except Exception:
        pass
    config_file = os.path.join(ROOT_DIR, "MyPixel.exe.config")
    if os.path.exists(config_file):
        datas.append((config_file, "."))

a = Analysis(
    ['launcher.py'],
    pathex=[ROOT_DIR],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'pymupdf.layout',
        'pymupdf_layout',
        'pymupdf4llm',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Pick icon if exists
icon_file = None
if sys.platform == 'darwin' and os.path.exists(os.path.join(ROOT_DIR, "MyPixel.icns")):
    icon_file = os.path.join(ROOT_DIR, "MyPixel.icns")
elif sys.platform == 'win32' and os.path.exists(os.path.join(ROOT_DIR, "MyPixel.ico")):
    icon_file = os.path.join(ROOT_DIR, "MyPixel.ico")

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='MyPixel',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_file,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='MyPixel',
)

if sys.platform == 'darwin':
    app = BUNDLE(
        coll,
        name='MyPixel.app',
        icon=icon_file,
        bundle_identifier='com.artdiff.mypixel',
        info_plist={
            'CFBundleName': 'MyPixel',
            'CFBundleDisplayName': 'MyPixel Artwork Inspection',
            'CFBundleIdentifier': 'com.artdiff.mypixel',
            'CFBundleVersion': '2.6.0',
            'CFBundleShortVersionString': '2.6.0',
            'NSHighResolutionCapable': 'True',
            'LSMinimumSystemVersion': '11.0',
        },
    )
