//! Native open and save dialogs, opened when a sub-application sends a
//! `file` request. Frame tests answer requests themselves and do not call
//! this module, so they never open a dialog.

use protocol::FileFilter;
use std::path::{Path, PathBuf};

pub(crate) fn pick_open(
    parent: &eframe::Frame,
    directory: Option<&Path>,
    filter: Option<&FileFilter>,
) -> Option<PathBuf> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(filter) = filter {
        dialog = dialog.add_filter(&filter.name, &filter.extensions);
    }
    if let Some(directory) = directory {
        dialog = dialog.set_directory(directory);
    }
    dialog.set_parent(parent).pick_file()
}

pub(crate) fn pick_save(
    parent: &eframe::Frame,
    directory: Option<&Path>,
    file_name: &str,
    filter: Option<&FileFilter>,
) -> Option<PathBuf> {
    let mut dialog = rfd::FileDialog::new().set_file_name(file_name);
    if let Some(filter) = filter {
        dialog = dialog.add_filter(&filter.name, &filter.extensions);
    }
    if let Some(directory) = directory {
        dialog = dialog.set_directory(directory);
    }
    dialog.set_parent(parent).save_file()
}

/// Several files to open at once, for the assistant's attachments.
pub(crate) fn pick_files(parent: &eframe::Frame, filter: &FileFilter) -> Vec<PathBuf> {
    rfd::FileDialog::new()
        .add_filter(&filter.name, &filter.extensions)
        .set_parent(parent)
        .pick_files()
        .unwrap_or_default()
}
