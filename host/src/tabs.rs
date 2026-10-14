//! Tab bar: the menu button, the tabs a sub-application reports, and the plus.

use crate::toolbar::{self, BAR, ICON, icon_text};
use eframe::egui::{self, Color32, RichText};

const INACTIVE: Color32 = Color32::from_rgb(243, 244, 247);
const TAB_EDGE: Color32 = Color32::from_rgb(229, 231, 235);
const TAB_HEIGHT: f32 = 34.0;

/// Draws the tab bar. The menu button, the plus, and each tab's close mark
/// are drawn, and a click on any of them does nothing.
pub(crate) fn show(ui: &mut egui::Ui, declaration: &protocol::Declaration) {
    let mut active_tab = None;
    let bar = egui::Frame::new()
        .fill(BAR)
        .inner_margin(egui::Margin {
            left: 8,
            right: 8,
            top: 6,
            bottom: 0,
        })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                ui.set_height(TAB_HEIGHT);
                menu(ui);
                active_tab = tab_row(ui, declaration);
                let _plus = toolbar::glyph_button(
                    ui,
                    "plus",
                    16.0,
                    egui::vec2(32.0, TAB_HEIGHT),
                    None,
                    true,
                    false,
                );
            });
        });
    // The hairline stops under the active tab, which joins the white toolbar.
    let rect = bar.response.rect;
    match active_tab {
        Some(tab) => {
            toolbar::hairline(ui, rect.left(), tab.left(), rect.bottom());
            toolbar::hairline(ui, tab.right(), rect.right(), rect.bottom());
        }
        None => toolbar::hairline(ui, rect.left(), rect.right(), rect.bottom()),
    }
}

fn menu(ui: &mut egui::Ui) {
    let _response = toolbar::glyph_button(
        ui,
        "menu",
        18.0,
        egui::vec2(32.0, TAB_HEIGHT),
        Some("Menu"),
        true,
        false,
    );
}

/// Returns the visible part of the active tab.
fn tab_row(ui: &mut egui::Ui, declaration: &protocol::Declaration) -> Option<egui::Rect> {
    let tabs: Vec<_> = declaration
        .tabs
        .iter()
        .enumerate()
        .map(|(index, tab)| (tab.id.as_str(), tab.label.as_str(), index == 0))
        .collect();
    let width = (ui.available_width() - 36.0).max(48.0);
    let mut active_rect = None;
    let row = egui::Layout::left_to_right(egui::Align::Center);
    ui.allocate_ui_with_layout(egui::vec2(width, TAB_HEIGHT), row, |ui| {
        ui.set_max_width(width);
        egui::ScrollArea::horizontal()
            .id_salt("tabs")
            .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
            .show(ui, |ui| {
                // A full-height row: `horizontal` would start short and grow
                // downward, which puts the tabs below the menu button.
                ui.with_layout(egui::Layout::left_to_right(egui::Align::Center), |ui| {
                    ui.set_height(TAB_HEIGHT);
                    ui.spacing_mut().item_spacing.x = 4.0;
                    let visible = ui.clip_rect();
                    for (id, name, active) in tabs {
                        let tab = Tab {
                            id,
                            name,
                            active,
                            close_waits: false,
                            unsaved: false,
                        };
                        let rect = tab_chip(ui, tab);
                        if active {
                            active_rect = Some(rect.intersect(visible));
                        }
                    }
                });
            });
    });
    active_rect.filter(|rect| rect.width() > 0.0)
}

struct Tab<'a> {
    id: &'a str,
    name: &'a str,
    active: bool,
    close_waits: bool,
    /// Unsaved changes: a dot stands in for the close mark until the tab is
    /// hovered.
    unsaved: bool,
}

/// One tab: its name, then its close control. Double-clicking does not edit
/// the title. A click on the tab or its close mark, including a middle click,
/// does nothing.
fn tab_chip(ui: &mut egui::Ui, tab: Tab<'_>) -> egui::Rect {
    const PAD_LEFT: f32 = 14.0;
    const PAD_RIGHT: f32 = 8.0;
    const CLOSE: f32 = 20.0;
    const MIN_WIDTH: f32 = 120.0;
    const MAX_LABEL: f32 = 180.0;

    let galley = egui::WidgetText::from(RichText::new(tab.name).size(13.5).color(ICON))
        .into_galley(
            ui,
            Some(egui::TextWrapMode::Truncate),
            MAX_LABEL,
            egui::FontSelection::Default,
        );
    let label_width = galley.size().x;
    let width = (PAD_LEFT + label_width + 10.0 + CLOSE + PAD_RIGHT).max(MIN_WIDTH);
    let (rect, response) =
        ui.allocate_exact_size(egui::vec2(width, TAB_HEIGHT), egui::Sense::click());
    paint_tab(ui.painter(), rect, tab.active);

    let label_rect = egui::Rect::from_min_size(
        egui::pos2(rect.left() + PAD_LEFT, rect.top()),
        egui::vec2(label_width, TAB_HEIGHT),
    );
    let top = rect.center().y - galley.size().y / 2.0;
    ui.painter()
        .galley(egui::pos2(label_rect.left(), top), galley, ICON);

    let close_rect = egui::Rect::from_center_size(
        egui::pos2(rect.right() - PAD_RIGHT - CLOSE / 2.0, rect.center().y),
        egui::vec2(CLOSE, CLOSE),
    );
    let close = close_control(ui, close_rect, tab.id, !tab.close_waits);
    let dot = tab.unsaved && !response.hovered() && !close.hovered();
    paint_close_mark(ui, close_rect, !tab.close_waits, dot);
    rect
}

/// Rounded top corners and an outline on the top and sides. The bottom edge
/// is the bar's hairline, or, for the active tab, the white toolbar.
fn paint_tab(painter: &egui::Painter, rect: egui::Rect, active: bool) {
    let fill = if active { Color32::WHITE } else { INACTIVE };
    let radius = egui::CornerRadius {
        nw: 8,
        ne: 8,
        sw: 0,
        se: 0,
    };
    painter.rect_filled(rect, radius, fill);

    let edge = rect.shrink2(egui::vec2(0.5, 0.0));
    let r = 8.0;
    let mut outline = vec![egui::pos2(edge.left(), edge.bottom())];
    let corner = |center: egui::Pos2, from: f32, outline: &mut Vec<egui::Pos2>| {
        for step in 0..=6 {
            let angle = from + std::f32::consts::FRAC_PI_2 * step as f32 / 6.0;
            outline.push(center + r * egui::vec2(angle.cos(), angle.sin()));
        }
    };
    let top = edge.top() + 0.5;
    corner(
        egui::pos2(edge.left() + r, top + r),
        std::f32::consts::PI,
        &mut outline,
    );
    corner(
        egui::pos2(edge.right() - r, top + r),
        -std::f32::consts::FRAC_PI_2,
        &mut outline,
    );
    outline.push(egui::pos2(edge.right(), edge.bottom()));
    painter.add(egui::Shape::line(outline, egui::Stroke::new(1.0, TAB_EDGE)));
}

fn close_control(ui: &mut egui::Ui, rect: egui::Rect, id: &str, enabled: bool) -> egui::Response {
    let sense = if enabled {
        egui::Sense::click()
    } else {
        egui::Sense::hover()
    };
    ui.interact(rect, egui::Id::new(("tab-close", id)), sense)
}

/// The close mark, or a dot while the sketch has unsaved changes and the
/// pointer is away from its tab.
fn paint_close_mark(ui: &egui::Ui, rect: egui::Rect, enabled: bool, dot: bool) {
    let color = if enabled { ICON } else { toolbar::ICON_QUIET };
    if dot {
        ui.painter().circle_filled(rect.center(), 4.0, color);
        return;
    }
    let glyph = icon_text("xmark", 11.0, color);
    let galley = egui::WidgetText::from(glyph).into_galley(
        ui,
        Some(egui::TextWrapMode::Extend),
        f32::INFINITY,
        egui::FontSelection::Default,
    );
    let top_left = rect.center() - galley.size() / 2.0;
    ui.painter().galley(top_left, galley, color);
}
