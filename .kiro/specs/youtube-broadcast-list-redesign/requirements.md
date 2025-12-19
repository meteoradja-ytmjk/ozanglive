# Requirements Document

## Introduction

Dokumen ini mendefinisikan persyaratan untuk merapikan tampilan daftar "Scheduled Broadcasts" di halaman YouTube Sync. Tampilan saat ini terlalu kompleks dengan thumbnail besar dan informasi yang berlebihan. Perubahan ini bertujuan untuk membuat tampilan lebih ringkas, rapi, dan mudah dibaca dengan menampilkan nomor urut, stream key saja, serta mempertahankan fungsi edit, copy, dan delete. Tampilan mobile juga akan diperbaiki agar lebih responsif.

## Glossary

- **Broadcast_List**: Komponen UI yang menampilkan daftar scheduled broadcasts di halaman YouTube Sync
- **Stream_Key**: Kunci unik yang digunakan untuk streaming ke YouTube
- **Broadcast_Item**: Satu baris item dalam daftar broadcast yang berisi informasi broadcast
- **Action_Buttons**: Tombol-tombol aksi (edit, copy, delete) untuk setiap broadcast item

## Requirements

### Requirement 1

**User Story:** As a user, I want to see a numbered list of scheduled broadcasts, so that I can easily identify and reference each broadcast by its position.

#### Acceptance Criteria

1. WHEN the Broadcast_List is rendered THEN the system SHALL display a sequential number starting from 1 for each Broadcast_Item
2. WHEN a new broadcast is added to the list THEN the system SHALL automatically assign the next sequential number
3. WHEN the list is filtered or sorted THEN the system SHALL maintain consistent numbering based on display order

### Requirement 2

**User Story:** As a user, I want a cleaner broadcast list without thumbnails, so that I can see more broadcasts at once and focus on essential information.

#### Acceptance Criteria

1. WHEN the Broadcast_List is rendered THEN the system SHALL NOT display thumbnail images for each Broadcast_Item
2. WHEN the Broadcast_List is rendered THEN the system SHALL display each Broadcast_Item in a compact single-row format
3. WHEN the Broadcast_List is rendered THEN the system SHALL display the broadcast title, channel name, privacy status, scheduled date/time, and stream key

### Requirement 3

**User Story:** As a user, I want to see the stream key prominently displayed, so that I can quickly copy it for use in streaming software.

#### Acceptance Criteria

1. WHEN a Broadcast_Item is rendered THEN the system SHALL display the stream key in a clearly visible format
2. WHEN a Broadcast_Item has no stream key THEN the system SHALL display a placeholder text indicating no stream key is available
3. WHEN the user clicks the copy button THEN the system SHALL copy the stream key to clipboard and provide visual feedback

### Requirement 4

**User Story:** As a user, I want to retain edit, copy (reuse), and delete functionality, so that I can manage my broadcasts effectively.

#### Acceptance Criteria

1. WHEN a Broadcast_Item is rendered THEN the system SHALL display Action_Buttons for edit, copy (reuse), and delete operations
2. WHEN the user clicks the edit button THEN the system SHALL open the edit broadcast modal with pre-filled data
3. WHEN the user clicks the copy (reuse) button THEN the system SHALL create a duplicate broadcast with the same settings
4. WHEN the user clicks the delete button THEN the system SHALL prompt for confirmation before deleting the broadcast

### Requirement 5

**User Story:** As a mobile user, I want a responsive broadcast list layout, so that I can easily view and manage broadcasts on smaller screens.

#### Acceptance Criteria

1. WHEN the Broadcast_List is viewed on mobile devices (screen width less than 768px) THEN the system SHALL display a card-based layout optimized for touch interaction
2. WHEN the mobile layout is rendered THEN the system SHALL display the broadcast number, title, stream key, and Action_Buttons in a stacked format
3. WHEN the mobile layout is rendered THEN the system SHALL ensure Action_Buttons are large enough for touch interaction (minimum 44px touch target)
4. WHEN the mobile layout is rendered THEN the system SHALL display the stream key with a copy button that is easily accessible
5. WHEN the user interacts with Action_Buttons on mobile THEN the system SHALL provide visual feedback for touch interactions

