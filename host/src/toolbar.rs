//! The tool area. This slice draws the empty bar; declared groups come later.

use crate::{icons, widgets};
use eframe::egui::{
    self, Align, Align2, Color32, FontFamily, FontId, Layout, RichText, Sense, Stroke, vec2,
};
use std::sync::Arc;

/// The bar behind the tabs. The toolbar and the active tab are white.
pub(crate) const BAR: Color32 = Color32::from_rgb(249, 250, 251);
pub(crate) const ICON: Color32 = Color32::from_rgb(45, 47, 51);
pub(crate) const ICON_QUIET: Color32 = Color32::from_rgb(186, 188, 192);
/// The current tool's icon. It has no plate behind it.
pub(crate) const ICON_ACTIVE: Color32 = Color32::from_rgb(37, 99, 235);
const HAIRLINE: Color32 = Color32::from_rgb(236, 237, 240);
#[allow(dead_code)]
const SEPARATOR: Color32 = Color32::from_rgb(222, 225, 229);

/// Every toolbar item is this tall and paints its content centered in it,
/// so the whole row shares one vertical center.
const ROW: f32 = 40.0;
/// A toolbar button's width. Its hover plate is a square two points narrower,
/// so neighboring plates keep a sliver of toolbar between them.
#[allow(dead_code)]
pub(crate) const BUTTON_W: f32 = 36.0;
#[allow(dead_code)]
const ICON_POINTS: f32 = 20.0;
/// A divider between toolbar groups, with its space on either side.
#[allow(dead_code)]
pub(crate) const SEPARATOR_W: f32 = 13.0;

/// Inter's roman variable font. Weight only: this file has no italic axis.
const INTER: &[u8] = include_bytes!("../assets/fonts/Inter-Variable.ttf");
/// Inter's italic variable font. Italic and bold italic are this file at two weights.
const INTER_ITALIC_FONT: &[u8] = include_bytes!("../assets/fonts/Inter-Italic-Variable.ttf");

fn inter_weight(bytes: &'static [u8], weight: f32) -> egui::FontData {
    let mut data = egui::FontData::from_static(bytes);
    data.tweak.coords = egui::epaint::text::VariationCoords::new([(b"wght", weight)]);
    data
}

fn install_face(fonts: &mut egui::FontDefinitions, name: &str, data: egui::FontData) {
    fonts.font_data.insert(name.into(), Arc::new(data));
    fonts
        .families
        .insert(FontFamily::Name(name.into()), vec![name.into()]);
}

pub(crate) fn install_fonts(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    install_face(&mut fonts, icons::INTER, inter_weight(INTER, 400.0));
    install_face(&mut fonts, icons::INTER_BOLD, inter_weight(INTER, 700.0));
    install_face(
        &mut fonts,
        icons::INTER_ITALIC,
        inter_weight(INTER_ITALIC_FONT, 400.0),
    );
    install_face(
        &mut fonts,
        icons::INTER_BOLD_ITALIC,
        inter_weight(INTER_ITALIC_FONT, 700.0),
    );
    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .insert(0, icons::INTER.into());
    fonts.font_data.insert(
        widgets::SEMIBOLD.into(),
        Arc::new(inter_weight(INTER, 600.0)),
    );
    fonts.families.insert(
        FontFamily::Name(widgets::SEMIBOLD.into()),
        vec![widgets::SEMIBOLD.into(), icons::INTER.into()],
    );
    for font in iconflow::fonts() {
        fonts.font_data.insert(
            font.family.to_string(),
            Arc::new(egui::FontData::from_static(font.bytes)),
        );
        fonts
            .families
            .entry(egui::FontFamily::Name(font.family.into()))
            .or_default()
            .insert(0, font.family.to_string());
    }
    ctx.set_fonts(fonts);
}

/// The Iconoir glyph for `name`, in its filled style when the name ends in
/// `-solid`. Quarter turns are applied by [`paint_icon`].
fn icon_glyph(name: &str, points: f32) -> (String, FontId) {
    let spec = icons::icon_spec(name);
    let style = if spec.filled {
        iconflow::Style::Filled
    } else {
        iconflow::Style::Regular
    };
    let icon = iconflow::try_icon(
        iconflow::Pack::Iconoir,
        spec.glyph,
        style,
        iconflow::Size::Regular,
    )
    .unwrap_or_else(|error| panic!("iconoir `{name}`: {error}"));
    let glyph = char::from_u32(icon.codepoint).unwrap_or('?');
    (
        glyph.to_string(),
        FontId::new(points, FontFamily::Name(icon.family.into())),
    )
}

pub(crate) fn paint_icon(
    painter: &egui::Painter,
    center: egui::Pos2,
    name: &str,
    points: f32,
    color: Color32,
) {
    let (glyph, font) = icon_glyph(name, points);
    let turns = icons::icon_spec(name).quarter_turns;
    if turns == 0 {
        painter.text(center, Align2::CENTER_CENTER, glyph, font, color);
        return;
    }
    // A text shape turns about its top-left corner, so place that corner
    // where the turned glyph's center lands on `center`.
    let galley = painter.layout_no_wrap(glyph, font, color);
    let angle = f32::from(turns) * std::f32::consts::FRAC_PI_2;
    let half = galley.size() / 2.0;
    let (sin, cos) = angle.sin_cos();
    let turned_half = vec2(half.x * cos - half.y * sin, half.x * sin + half.y * cos);
    painter
        .add(egui::epaint::TextShape::new(center - turned_half, galley, color).with_angle(angle));
}

pub(crate) fn icon_text(name: &str, points: f32, color: Color32) -> RichText {
    let (glyph, font) = icon_glyph(name, points);
    RichText::new(glyph).font(font).color(color)
}

/// A frameless icon button of a fixed size, its glyph painted at the center.
pub(crate) fn glyph_button(
    ui: &mut egui::Ui,
    name: &str,
    points: f32,
    size: egui::Vec2,
    tip: Option<&str>,
    enabled: bool,
    selected: bool,
) -> egui::Response {
    // A button that can be used covers the toolbar's row: dragging on it does
    // not scroll the row, and the pointer is not the row's open hand. One
    // that waits only shows its name, so the row can be dragged over it.
    let sense = if enabled {
        Sense::click_and_drag()
    } else {
        Sense::hover()
    };
    let (rect, response) = ui.allocate_exact_size(size, sense);
    // No plate behind the icon: the current tool, and a button under the
    // pointer, are marked by the icon's blue alone.
    let color = match (enabled, selected || response.hovered()) {
        (true, true) => ICON_ACTIVE,
        (true, false) => ICON,
        (false, _) => ICON_QUIET,
    };
    paint_icon(ui.painter(), rect.center(), name, points, color);
    let label = tip.unwrap_or(name).to_string();
    response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Button, enabled, &label));
    match tip {
        Some(tip) => response.on_hover_text(tip),
        None => response,
    }
}

#[allow(dead_code)]
fn icon_button(
    ui: &mut egui::Ui,
    name: &str,
    tip: Option<&str>,
    enabled: bool,
    selected: bool,
) -> egui::Response {
    glyph_button(
        ui,
        name,
        ICON_POINTS,
        vec2(BUTTON_W, ROW),
        tip,
        enabled,
        selected,
    )
}

/// Draws the empty toolbar. The trailing side is laid out first, from the
/// right, so a later declaration can pin that group while the rest scrolls.
pub(crate) fn show(ui: &mut egui::Ui) {
    let bar = egui::Frame::new()
        .fill(Color32::WHITE)
        .inner_margin(egui::Margin::symmetric(12, 5))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.set_height(ROW);
            ui.spacing_mut().item_spacing.x = 0.0;
            // The trailing group is laid out first, from the right edge, so a
            // narrow window scrolls the other groups instead.
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                    // A row wider than the window scrolls: the wheel turns it
                    // sideways without Shift, and dragging it moves it.
                    ui.style_mut().always_scroll_the_only_direction = true;
                    let scrolled = egui::ScrollArea::horizontal()
                        .id_salt("toolbar")
                        .scroll_source(egui::scroll_area::ScrollSource {
                            scroll_bar: false,
                            drag: egui::scroll_area::DragScroll::Always,
                            mouse_wheel: true,
                        })
                        .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
                        .show(ui, |ui| {
                            // A full-height row: `horizontal` would start
                            // short and grow downward, below the trailing group.
                            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                                ui.set_height(ROW);
                            });
                        });
                    widgets::drag_scroll_cursor(ui, scrolled.id);
                });
            });
        });
    let rect = bar.response.rect;
    hairline(ui, rect.left(), rect.right(), rect.bottom());
}

/// A 1-point line along the bottom edge of a bar, inside it, so the next bar
/// painted below does not cover it.
pub(crate) fn hairline(ui: &egui::Ui, from: f32, to: f32, bottom: f32) {
    if to <= from {
        return;
    }
    ui.painter()
        .hline(from..=to, bottom - 0.5, Stroke::new(1.0, HAIRLINE));
}

#[allow(dead_code)]
fn separator(ui: &mut egui::Ui) {
    let (rect, _) = ui.allocate_exact_size(vec2(SEPARATOR_W, ROW), Sense::hover());
    let center = rect.center();
    ui.painter().vline(
        center.x,
        (center.y - 12.0)..=(center.y + 12.0),
        Stroke::new(1.0, SEPARATOR),
    );
}
