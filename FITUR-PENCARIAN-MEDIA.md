# Fitur Pencarian Media - Render Jobs

## Deskripsi
Fitur pencarian telah ditambahkan di halaman **Active Jobs** pada Step 3 (Select Videos & Audio) untuk memudahkan pencarian video dan audio dengan cepat berdasarkan **nama file** atau **nama folder/grup**.

## Fitur yang Ditambahkan

### 1. Search Box di Tab Video
- Input pencarian dengan icon search
- Real-time filtering saat mengetik
- Placeholder: "Search videos or folders..."
- Posisi: Di atas list video

### 2. Search Box di Tab Audio  
- Input pencarian dengan icon search
- Real-time filtering saat mengetik
- Placeholder: "Search audio or folders..."
- Posisi: Di atas list audio

## Cara Menggunakan

1. **Buka halaman Render Dashboard** (Active Jobs)
2. **Scroll ke Step 3** - Select Videos & Audio
3. **Pilih tab Video atau Audio**
4. **Ketik nama file atau nama folder** yang ingin dicari di search box
5. **List akan otomatis ter-filter** sesuai keyword yang diketik

## Fitur Pencarian

### Kemampuan:
- ✅ Pencarian real-time (instant search)
- ✅ Case-insensitive (tidak peduli huruf besar/kecil)
- ✅ Mencari berdasarkan **nama file**
- ✅ Mencari berdasarkan **nama folder/grup** ← **BARU!**
- ✅ Auto-expand folder yang cocok dengan pencarian
- ✅ Menampilkan semua file dalam folder jika nama folder cocok
- ✅ Menyembunyikan grup yang tidak memiliki hasil
- ✅ Menampilkan pesan "No results" jika tidak ada hasil
- ✅ Animasi smooth saat filter

### Contoh Penggunaan:

#### Pencarian Berdasarkan Nama File:
- Ketik: `music` → Akan menampilkan semua file yang mengandung kata "music"
- Ketik: `video1` → Akan menampilkan file yang mengandung "video1"

#### Pencarian Berdasarkan Nama Folder:
- Ketik: `lagu` → Akan menampilkan folder "lagu" dan **semua isinya**
- Ketik: `tutorial` → Akan menampilkan folder "tutorial" dan **semua file di dalamnya**
- Ketik: `music` → Akan menampilkan folder "music" beserta semua file

#### Kombinasi:
- Jika ketik nama folder → Semua file dalam folder tersebut ditampilkan
- Jika ketik nama file → Hanya file yang cocok yang ditampilkan
- Kosongkan search box → Menampilkan semua file dan folder kembali

## Styling
- Search box dengan border abu-abu
- Focus state dengan border ungu (primary color)
- Icon search di sebelah kiri
- Animasi fade-in untuk pesan "no results"
- Auto-expand folder yang cocok dengan pencarian

## Technical Details

### File yang Dimodifikasi:
- `views/render-jobs.ejs`

### Fungsi JavaScript yang Ditambahkan:
- `filterMedia(type)` - Fungsi utama untuk filtering (support folder & file name)

### Logika Pencarian:
1. Ambil keyword dari search input
2. Loop semua grup/folder
3. Cek apakah nama folder cocok dengan keyword
4. Jika folder cocok → Tampilkan semua file dalam folder tersebut
5. Jika folder tidak cocok → Cek setiap file dalam folder
6. Tampilkan file yang cocok dengan keyword
7. Sembunyikan grup/folder yang tidak memiliki hasil

### CSS yang Ditambahkan:
- Focus state styling untuk search input
- Animation untuk no-results message

## Screenshot Lokasi
```
Render Dashboard
└── Step 3: Select Videos & Audio
    ├── Tab: Videos
    │   ├── [Search Box] ← Bisa cari file atau folder!
    │   └── Video List (Grouped by Folder)
    └── Tab: Audio
        ├── [Search Box] ← Bisa cari file atau folder!
        └── Audio List (Grouped by Folder)
```

## Update Log

### 13 Mei 2026 - v1.0
- ✅ Fitur pencarian berhasil ditambahkan
- ✅ Berfungsi di tab Video dan Audio
- ✅ Real-time filtering
- ✅ UI/UX yang clean dan responsive

### 13 Mei 2026 - v1.1
- ✅ **Ditambahkan pencarian berdasarkan nama folder**
- ✅ Auto-expand folder yang cocok
- ✅ Menampilkan semua file dalam folder jika nama folder cocok
- ✅ Update placeholder text menjadi "Search videos or folders..."
