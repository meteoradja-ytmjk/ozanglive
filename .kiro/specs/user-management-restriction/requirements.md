# Requirements Document

## Introduction

Fitur ini memperbarui sistem User Management untuk membatasi kemampuan Admin dalam mengelola akun user. Saat ini Admin dapat menghapus dan mengedit semua user, namun perubahan ini akan membatasi Admin agar TIDAK BISA menghapus akun user dan TIDAK BISA melakukan edit user. Perubahan ini bertujuan untuk meningkatkan keamanan data user dan mencegah penghapusan atau modifikasi akun yang tidak disengaja.

## Glossary

- **Admin**: User dengan role 'admin' yang memiliki akses ke halaman User Management
- **User Management**: Halaman untuk mengelola akun user dalam sistem (/users)
- **Member**: User dengan role 'member' yang memiliki akses terbatas
- **Edit User**: Fitur untuk mengubah data user seperti username, role, status, password, dan avatar
- **Delete User**: Fitur untuk menghapus akun user beserta semua data terkait (video, stream)

## Requirements

### Requirement 1

**User Story:** Sebagai Admin, saya ingin sistem mencegah penghapusan akun user, sehingga data user tetap aman dan tidak terhapus secara tidak sengaja.

#### Acceptance Criteria

1. WHEN Admin mengakses halaman User Management THEN sistem SHALL menyembunyikan tombol delete untuk semua user
2. WHEN Admin mencoba menghapus user melalui API endpoint /api/users/delete THEN sistem SHALL menolak request dan mengembalikan error message
3. WHEN sistem menolak request delete THEN sistem SHALL mengembalikan HTTP status code 403 dengan pesan "User deletion is not allowed"

### Requirement 2

**User Story:** Sebagai Admin, saya ingin sistem mencegah pengeditan akun user lain, sehingga data user tidak dapat dimodifikasi tanpa izin.

#### Acceptance Criteria

1. WHEN Admin mengakses halaman User Management THEN sistem SHALL menyembunyikan tombol edit untuk semua user
2. WHEN Admin mencoba mengupdate user melalui API endpoint /api/users/update THEN sistem SHALL menolak request dan mengembalikan error message
3. WHEN sistem menolak request update THEN sistem SHALL mengembalikan HTTP status code 403 dengan pesan "User editing is not allowed"

### Requirement 3

**User Story:** Sebagai Admin, saya tetap ingin bisa melihat daftar user dan informasi mereka, sehingga saya dapat memantau aktivitas user dalam sistem.

#### Acceptance Criteria

1. WHEN Admin mengakses halaman User Management THEN sistem SHALL menampilkan daftar semua user dengan informasi lengkap (username, role, status, video count, stream count, created date)
2. WHEN Admin melihat daftar user THEN sistem SHALL tetap menampilkan fitur search dan filter berdasarkan role dan status
3. WHEN Admin mengklik kolom Video atau Streaming THEN sistem SHALL tetap menampilkan modal dengan detail video/stream user tersebut

### Requirement 4

**User Story:** Sebagai Admin, saya tetap ingin bisa membuat user baru, sehingga saya dapat menambahkan anggota baru ke dalam sistem.

#### Acceptance Criteria

1. WHEN Admin mengakses halaman User Management THEN sistem SHALL tetap menampilkan tombol "Create New User"
2. WHEN Admin mengklik tombol "Create New User" THEN sistem SHALL menampilkan modal form untuk membuat user baru
3. WHEN Admin submit form create user dengan data valid THEN sistem SHALL membuat user baru dan menampilkan pesan sukses
