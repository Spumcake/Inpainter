//! Controls shared by the menu rows and the panel tab.
//!
//! Menu rows are drawn when a sub-application declares them. This slice's
//! template declares none, so the menu does not open and those rows are unused.
#![allow(dead_code)]

use crate::toolbar;
use eframe::egui::{
    self, Align2, Color32, FontFamily, FontId, Painter, Pos2, Sense, Stroke, pos2, vec2,
};

/// The one accent: slider fill and knob, a toggle that is on, the curve.
pub(crate) const INK: Color32 = Color32::from_rgb(40, 42, 46);
/// Values and headings.
pub(crate) const TEXT: Color32 = Color32::from_rgb(45, 47, 51);
/// Row labels and secondary lines.
pub(crate) const MUTED: Color32 = Color32::from_rgb(107, 114, 128);
pub(crate) const RAIL: Color32 = Color32::from_rgb(212, 214, 218);
pub(crate) const BORDER: Color32 = Color32::from_rgb(226, 229, 233);
const BORDER_HOVER: Color32 = Color32::from_rgb(196, 200, 206);
/// A chosen segment or menu row.
pub(crate) const SELECTED: Color32 = Color32::from_rgb(236, 238, 241);
const DISABLED: Color32 = Color32::from_rgb(186, 188, 192);

const BODY: f32 = 13.5;

/// The semibold face used for headings. Body text is Inter at regular weight.
pub(crate) const SEMIBOLD: &str = "Inter SemiBold";

/// How large the shared controls are drawn, as a factor of full size.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Scale(pub f32);

impl Scale {
    /// The properties panel: seven eighths of full size, which the owner chose
    /// by shrinking a screenshot of the panel until it read right.
    pub(crate) const PANEL: Scale = Scale(0.875);

    /// A full-size length at this scale.
    pub(crate) const fn of(self, length: f32) -> f32 {
        length * self.0
    }
}

pub(crate) fn body(s: Scale) -> FontId {
    FontId::proportional(s.of(BODY))
}

pub(crate) fn semibold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(SEMIBOLD.into()))
}

/// A small downward chevron, drawn rather than taken from a font so it sits
/// exactly on the field's center line.
pub(crate) fn chevron(painter: &Painter, center: Pos2, color: Color32, s: Scale) {
    let stroke = Stroke::new(1.5, color);
    let (x, y) = (s.of(4.0), s.of(2.0));
    painter.line_segment([center + vec2(-x, -y), center + vec2(0.0, y)], stroke);
    painter.line_segment([center + vec2(0.0, y), center + vec2(x, -y)], stroke);
}

/// A small sideways chevron: pointing right when `right`, left otherwise.
pub(crate) fn chevron_side(painter: &Painter, center: Pos2, right: bool, color: Color32) {
    let stroke = Stroke::new(1.5, color);
    let x = if right { 2.0 } else { -2.0 };
    painter.line_segment([center + vec2(-x, -4.0), center + vec2(x, 0.0)], stroke);
    painter.line_segment([center + vec2(x, 0.0), center + vec2(-x, 4.0)], stroke);
}

/// One row of a dropdown or right-click menu.
pub(crate) struct MenuItem<'a> {
    pub label: &'a str,
    /// An icon before the label. When any row has one, every label starts
    /// after the icon column.
    pub icon: Option<&'a str>,
    pub enabled: bool,
    /// The row opens a submenu to its right instead of acting itself.
    pub submenu: bool,
    /// A hairline separates this row from the rows above it.
    pub divider: bool,
}

/// What a menu chose: one of its own rows, or what one of its submenus chose.
pub(crate) enum MenuPick<T> {
    Row(usize),
    Sub(T),
}

/// The narrowest a menu row is drawn.
const MENU_MIN_W: f32 = 148.0;
/// The space between a menu row's edge and its label, on both sides.
const MENU_INSET: f32 = 10.0;
/// A menu row's icon, and the gap from it to the label.
const MENU_ICON: f32 = 18.0;
const MENU_ICON_GAP: f32 = 8.0;
/// The chevron at the end of a row that opens a submenu.
const MENU_CHEVRON: f32 = 14.0;
const MENU_CHEVRON_ICON: &str = "nav-arrow-right";

/// The rows of every small menu. Menus are drawn at full size wherever they
/// open, because their rows act like buttons. The rows are as wide as the
/// longest label plus the same space on either side. A row is highlighted
/// under the pointer and drawn lighter when it waits. Returns the row
/// clicked, and closes the menu.
pub(crate) fn menu_rows(ui: &mut egui::Ui, items: &[MenuItem]) -> Option<usize> {
    match menu_rows_with(ui, items, |_, _| None::<()>) {
        Some(MenuPick::Row(index)) => Some(index),
        _ => None,
    }
}

/// `menu_rows` with submenus. A row marked `submenu` shows a chevron and,
/// while it is hovered or open, shows `submenu`'s contents for that row's
/// index to its right. Choosing in a submenu closes the whole menu.
pub(crate) fn menu_rows_with<T>(
    ui: &mut egui::Ui,
    items: &[MenuItem],
    mut submenu: impl FnMut(usize, &mut egui::Ui) -> Option<T>,
) -> Option<MenuPick<T>> {
    ui.spacing_mut().item_spacing.y = 2.0;
    let font = body(Scale(1.0));
    let widest = items
        .iter()
        .map(|item| {
            ui.painter()
                .layout_no_wrap(item.label.to_string(), font.clone(), TEXT)
                .size()
                .x
        })
        .fold(0.0, f32::max);
    let icons = items.iter().any(|item| item.icon.is_some());
    let label_x = MENU_INSET
        + if icons {
            MENU_ICON + MENU_ICON_GAP
        } else {
            0.0
        };
    let chevron = if items.iter().any(|item| item.submenu) {
        MENU_ICON_GAP + MENU_CHEVRON
    } else {
        0.0
    };
    let width = (widest + label_x + chevron + MENU_INSET)
        .max(MENU_MIN_W)
        .ceil();
    let mut chosen = None;
    for (index, item) in items.iter().enumerate() {
        if item.divider {
            let (line, _) = ui.allocate_exact_size(vec2(width, 5.0), Sense::hover());
            ui.painter().hline(
                line.x_range(),
                line.center().y.round() + 0.5,
                Stroke::new(1.0, BORDER),
            );
        }
        let sense = if item.enabled {
            Sense::click()
        } else {
            Sense::hover()
        };
        let (row, response) = ui.allocate_exact_size(vec2(width, 28.0), sense);
        // Filled in once it is known whether this row's submenu is open.
        let highlight = ui.painter().add(egui::Shape::Noop);
        let mut open = false;
        if item.submenu {
            toolbar::paint_icon(
                ui.painter(),
                pos2(
                    row.right() - MENU_INSET - MENU_CHEVRON / 2.0,
                    row.center().y,
                ),
                MENU_CHEVRON_ICON,
                MENU_CHEVRON,
                quiet(item.enabled),
            );
            if item.enabled
                && let Some(inner) =
                    egui::containers::menu::SubMenu::new()
                        .show(ui, &response, |ui| submenu(index, ui))
            {
                open = true;
                if let Some(value) = inner.inner {
                    chosen = Some(MenuPick::Sub(value));
                }
            }
        }
        if item.enabled && (response.hovered() || open) {
            ui.painter()
                .set(highlight, egui::Shape::rect_filled(row, 4.0, SELECTED));
        }
        if let Some(icon) = item.icon {
            toolbar::paint_icon(
                ui.painter(),
                pos2(row.left() + MENU_INSET + MENU_ICON / 2.0, row.center().y),
                icon,
                MENU_ICON,
                quiet(item.enabled),
            );
        }
        ui.painter().text(
            pos2(row.left() + label_x, row.center().y),
            Align2::LEFT_CENTER,
            item.label,
            font.clone(),
            quiet(item.enabled),
        );
        if item.enabled && !item.submenu && response.clicked() {
            chosen = Some(MenuPick::Row(index));
            ui.close();
        }
    }
    chosen
}

/// An area that can be dragged to scroll, the panel or the toolbar's row,
/// shows an open hand over its background and a closed hand while it is
/// dragged. Every control on such an area senses drags as well as clicks, so
/// it covers the background: no hand over it, and no scroll from it. A
/// control that asked for its own pointer, such as a text field's I-beam,
/// keeps it. `scroll` is the scroll area's id.
pub(crate) fn drag_scroll_cursor(ui: &egui::Ui, scroll: egui::Id) {
    let Some(background) = ui.ctx().read_response(scroll.with("area")) else {
        return;
    };
    if background.dragged() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::Grabbing);
    } else if background.hovered()
        && ui.ctx().output(|output| output.cursor_icon) == egui::CursorIcon::Default
    {
        ui.ctx().set_cursor_icon(egui::CursorIcon::Grab);
    }
}

/// Text drawn lighter, for a control that waits.
pub(crate) fn quiet(enabled: bool) -> Color32 {
    if enabled { TEXT } else { DISABLED }
}
