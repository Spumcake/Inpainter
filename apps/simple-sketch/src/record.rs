//! One open sketch: the model, a `draw::Sketch`, wrapped with what Simple Sketch
//! owns about it: its id, name, save state, and the undo and redo history.
//! Every edit to the model goes through `commit_step` or `record`.

use draw::document::{
    Allocator, Camera, HeldIds, Sketch, SketchId, Step, ToolColor,
};
use std::ops::{Deref, DerefMut};
use std::path::{Path, PathBuf};

/// The fields that left `draw`'s sketch, wrapped around that model.
pub struct Record {
    pub sketch: Sketch,
    id: SketchId,
    name: String,
    generated_name: String,
    /// A save of this id has succeeded. Later edits set `dirty`.
    stored: bool,
    /// Content, the name, or the camera differs from the last successful save.
    dirty: bool,
    /// The `.smx` later saves write. Absent until Save or Save As succeeds.
    path: Option<PathBuf>,
    /// Recovery file id, when a restore kept a file named with the old id.
    recovery_file: Option<SketchId>,
    undo: Vec<Step>,
    redo: Vec<Step>,
}

impl Record {
    /// A new untitled sketch, as the reference's `Sketch::untitled` made one.
    pub fn untitled(id: SketchId, name: String, ids: &mut Allocator, palette: &[ToolColor]) -> Self {
        Self {
            sketch: Sketch::untitled(ids, palette),
            id,
            generated_name: name.clone(),
            name,
            stored: false,
            dirty: false,
            path: None,
            recovery_file: None,
            undo: Vec::new(),
            redo: Vec::new(),
        }
    }

    /// A sketch read from a `.smx` or recovery file, as the reference's reader
    /// made it: stored, clean, its name as the generated name, no history.
    pub fn from_snapshot(snapshot: draw::document::snapshot::SnapshotSketch) -> Self {
        Self {
            sketch: snapshot.sketch,
            id: snapshot.id,
            generated_name: snapshot.name.clone(),
            name: snapshot.name,
            stored: true,
            dirty: false,
            path: None,
            recovery_file: None,
            undo: Vec::new(),
            redo: Vec::new(),
        }
    }

    /// An edit a `draw` method built and has not applied: applies it and
    /// records it. `None`, an edit that changed nothing, records nothing.
    pub fn commit(&mut self, step: Option<Step>) -> bool {
        match step {
            Some(step) => {
                self.commit_step(step);
                true
            }
            None => false,
        }
    }

    /// A camera change, as the reference's `note_view` noted it: the sketch
    /// has unsaved changes only when the camera actually moved.
    pub fn move_view(&mut self, change: impl FnOnce(&mut Camera, &Sketch)) {
        let before = self.sketch.camera();
        let mut camera = before;
        change(&mut camera, &self.sketch);
        if camera.origin != before.origin || camera.zoom != before.zoom {
            self.sketch.set_camera(camera);
            self.dirty = true;
        }
    }

    /// A live change with no history, such as a drag preview or a property
    /// the reference set directly. The release, when there is one, records it.
    pub fn preview(&mut self, step: Option<Step>) -> bool {
        let Some(step) = step else {
            return false;
        };
        self.sketch.apply(&step);
        true
    }

    /// An edit already applied to the model, such as a transform preview the
    /// release keeps. Records it without applying it again.
    pub fn record(&mut self, step: Option<Step>) -> bool {
        let Some(step) = step else {
            return false;
        };
        self.dirty = true;
        self.redo.clear();
        self.undo.push(step);
        true
    }

    pub fn id(&self) -> SketchId {
        self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn set_name(&mut self, name: String) {
        if self.name == name {
            return;
        }
        self.name = name;
        self.dirty = true;
    }

    /// Starting canvas only, no strokes, the default palette, the generated
    /// name, and never saved.
    pub fn is_clean(&self) -> bool {
        if self.stored || self.name != self.generated_name {
            return false;
        }
        self.sketch.model_is_blank()
    }

    /// Changes since the last save, or a renamed title that has not been saved.
    pub fn needs_keep(&self) -> bool {
        if self.stored {
            self.dirty
        } else {
            !self.is_clean()
        }
    }

    pub fn mark_saved(&mut self) {
        self.stored = true;
        self.dirty = false;
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn set_path(&mut self, path: Option<PathBuf>) {
        self.path = path;
    }

    pub fn recovery_file(&self) -> Option<SketchId> {
        self.recovery_file
    }

    pub fn set_recovery_file(&mut self, id: SketchId) {
        self.recovery_file = Some(id);
    }

    pub fn set_id(&mut self, id: SketchId) {
        self.id = id;
    }

    /// Opened from a `.smx` or restored from recovery. The stored camera stays.
    pub fn keeps_stored_view(&self) -> bool {
        self.stored || self.path.is_some() || self.recovery_file.is_some()
    }

    pub fn set_dirty(&mut self, dirty: bool) {
        self.dirty = dirty;
    }

    pub fn clear_redo(&mut self) {
        self.redo.clear();
    }

    pub fn undo_len(&self) -> usize {
        self.undo.len()
    }

    pub fn redo_len(&self) -> usize {
        self.redo.len()
    }

    /// Applies `step` to the model, then pushes it onto this record's history.
    pub fn commit_step(&mut self, step: Step) {
        self.dirty = true;
        self.redo.clear();
        self.sketch.apply(&step);
        self.undo.push(step);
    }

    pub fn undo(&mut self) -> bool {
        let Some(step) = self.undo.pop() else {
            return false;
        };
        self.dirty = true;
        self.sketch.revert(&step);
        self.redo.push(step);
        true
    }

    pub fn redo(&mut self) -> bool {
        let Some(step) = self.redo.pop() else {
            return false;
        };
        self.dirty = true;
        self.sketch.apply(&step);
        self.undo.push(step);
        true
    }

    /// A `.smx` just opened. No selection and no highlighted canvas.
    pub fn mark_opened(&mut self, path: PathBuf, title: String) {
        self.name = title.clone();
        self.generated_name = title;
        self.path = Some(path);
        self.stored = true;
        self.dirty = false;
        self.recovery_file = None;
        self.undo.clear();
        self.redo.clear();
        self.sketch.clear_open_state();
    }

    /// A recovery copy just opened. Still unsaved. The original path is kept
    /// when the recovery file stored one.
    pub fn mark_restored(&mut self, path: Option<PathBuf>, title: String, file_id: SketchId) {
        self.name = title.clone();
        self.generated_name = title;
        self.stored = path.is_some();
        self.path = path;
        self.dirty = true;
        self.recovery_file = Some(file_id);
        self.undo.clear();
        self.redo.clear();
        self.sketch.clear_open_state();
    }

    pub fn collect_held(&self, held: &mut HeldIds) {
        held.sketches.insert(self.id.get());
        self.sketch.collect_held(held);
    }

    /// Ids this sketch shares with `held` become new ones.
    pub fn separate_ids(&mut self, held: &HeldIds, ids: &mut Allocator, next_sketch: &mut u64) {
        if held.sketches.contains(&self.id.get()) {
            self.id = SketchId::new(*next_sketch);
            *next_sketch += 1;
        }
        self.sketch.separate_ids(held, ids);
    }

    /// A clean opening sketch takes a palette loaded after it was made.
    pub fn adopt_palette(&mut self, palette: &[ToolColor], ids: &mut Allocator) {
        if palette.is_empty() || !self.is_clean() {
            return;
        }
        self.sketch.adopt_palette(palette, ids);
    }
}

impl Deref for Record {
    type Target = Sketch;

    fn deref(&self) -> &Sketch {
        &self.sketch
    }
}

impl DerefMut for Record {
    fn deref_mut(&mut self) -> &mut Sketch {
        &mut self.sketch
    }
}
