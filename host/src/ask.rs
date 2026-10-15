//! A question a sub-application asks, in the look of Simple Sketch 1.0.1's
//! `confirm`, `replace_dialog`, `recovery_dialog`, and `error_dialog`: a bold
//! title, its lines, then the buttons in a row.

use eframe::egui::{self, RichText};
use protocol::Ask;

/// Draws `ask` and returns the button chosen this frame. Escape or a click
/// outside chooses the question's dismiss button, when it has one.
pub(crate) fn show(ctx: &egui::Context, app: usize, ask: &Ask) -> Option<String> {
    let mut chosen = None;
    let modal = egui::Modal::new(egui::Id::new(("ask", app, ask.id.as_str()))).show(ctx, |ui| {
        ui.set_min_width(260.0);
        ui.set_max_width(360.0);
        ui.label(RichText::new(&ask.title).strong().size(16.0));
        ui.add_space(4.0);
        for line in &ask.lines {
            ui.label(line);
        }
        ui.add_space(12.0);
        ui.horizontal(|ui| {
            for button in &ask.buttons {
                if ui.button(&button.label).clicked() {
                    chosen = Some(button.id.clone());
                }
            }
        });
    });
    if chosen.is_none() && modal.should_close() {
        chosen = ask.dismiss.clone();
    }
    chosen
}
