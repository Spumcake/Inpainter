//! The properties column and the tab on its edge.

use crate::widgets::{self, BORDER, TEXT};
use eframe::egui::{
    self, Align, Color32, CornerRadius, Layout, Rect, Sense, Stroke, StrokeKind, UiBuilder, pos2,
    vec2,
};

/// The contents, 268 points wide at full size, at the panel's scale, plus
/// the side padding, rounded to a whole point so the edge stays crisp.
pub(crate) const WIDTH: f32 = 266.0;

const PAD: f32 = 16.0;
const TAB: egui::Vec2 = vec2(22.0, 40.0);
/// The tab's distance below the top of the canvas.
const TAB_TOP: f32 = 18.0;

pub(crate) fn show(ui: &mut egui::Ui, rect: Rect) {
    ui.painter().rect_filled(rect, 0.0, Color32::WHITE);
    ui.painter()
        .vline(rect.left() + 0.5, rect.y_range(), Stroke::new(1.0, BORDER));

    // Too narrow for the padding: nothing can be drawn there this frame.
    if rect.width() <= 2.0 * PAD {
        return;
    }
    let content = rect.shrink2(vec2(PAD, 0.0));
    let mut panel = ui.new_child(
        UiBuilder::new()
            .max_rect(content)
            .layout(Layout::top_down(Align::Min)),
    );
    panel.set_clip_rect(rect);
    panel.spacing_mut().item_spacing = vec2(0.0, 0.0);
    // No scroll bars: the page scrolls with the wheel or by dragging it.
    let scrolled = egui::ScrollArea::vertical()
        .id_salt("properties-panel")
        .auto_shrink([false, false])
        .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
        .scroll_source(egui::scroll_area::ScrollSource {
            scroll_bar: false,
            drag: egui::scroll_area::DragScroll::Always,
            mouse_wheel: true,
        })
        .show(&mut panel, |ui| {
            ui.spacing_mut().item_spacing = vec2(0.0, 0.0);
            ui.set_width(content.width());
            ui.add_space(PAD);
        });
    widgets::drag_scroll_cursor(ui, scrolled.id);
}

/// The tab that shows and hides the panel, like F4. It sits at the panel's
/// left edge, or at the canvas's right edge while the panel is closed, on a
/// layer above the canvas so a click on it never falls through to the view.
pub(crate) fn toggle_tab(ctx: &egui::Context, open: &mut bool, edge_x: f32, top: f32) {
    let is_open = *open;
    let origin = pos2(edge_x - TAB.x, top + TAB_TOP);
    egui::Area::new(egui::Id::new("panel-toggle"))
        .order(egui::Order::Foreground)
        .fixed_pos(origin)
        .show(ctx, |ui| {
            // One point wider than the tab, so it covers the panel's hairline
            // and joins the panel instead of sitting beside it.
            let (rect, response) = ui.allocate_exact_size(TAB + vec2(1.0, 0.0), Sense::click());
            let tip = crate::icons::panel_tip();
            let response = response.on_hover_text(tip);
            let radius = CornerRadius {
                nw: 10,
                sw: 10,
                ne: 0,
                se: 0,
            };
            let fill = if response.hovered() {
                widgets::SELECTED
            } else {
                Color32::WHITE
            };
            ui.painter().rect(
                rect,
                radius,
                fill,
                Stroke::new(1.0, BORDER),
                StrokeKind::Inside,
            );
            if is_open {
                let seam = Rect::from_min_max(
                    pos2(rect.right() - 1.5, rect.top() + 1.0),
                    pos2(rect.right(), rect.bottom() - 1.0),
                );
                ui.painter().rect_filled(seam, 0.0, fill);
            }
            // Centered on the tab's visible inside: from the inner edge of
            // its border to the panel edge, which the tab overlaps by one
            // point. The rounded left side is part of that inside.
            let inside = Rect::from_min_max(pos2(rect.left() + 1.0, rect.top()), rect.max);
            let center = pos2(inside.center().x + 0.5, rect.center().y);
            widgets::chevron_side(ui.painter(), center, is_open, TEXT);
            if response.clicked() {
                *open = !*open;
            }
        });
}
