mod auth;
mod bootstrap;
mod browser;
mod cli;
mod dev_auth;
mod home;
mod paths;
mod skill_browser;
mod studio;
mod workspace;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

use auth::{get_auth_session, sign_in, AuthState};
use browser::{get_browser_shell, get_destination_content, get_settings, update_settings};
use studio::{open_workspace, shutdown_host_for_app, StudioHost};
use dev_auth::{shutdown_auth_for_app, DevAuth};
use workspace::{
    add_workspace, create_agent, create_workspace, get_user_home, get_workspaces_dir,
    read_text_file, remove_workspace, reveal_folder,
};

const TRAY_ICON_ID: &str = "inpainter-launcher";
const MENU_OPEN: &str = "open_inpainter";
const MENU_SIGN_OUT: &str = "sign_out";
const MENU_QUIT: &str = "quit";

fn load_tray_icon() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/tray-dark.png")).expect("invalid tray icon")
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_from_tray(app: &tauri::AppHandle) {
    match auth::refresh_auth_status() {
        Ok(value) => {
            if let Some(state) = app.try_state::<AuthState>() {
                state.set_authenticated_flag(value);
            }
        }
        Err(err) => {
            eprintln!("[inpainter] failed to read CLI session: {err}");
        }
    }
    show_main_window(app);
}

fn sign_out_from_tray(app: &tauri::AppHandle) {
    if let Err(err) = auth::sign_out(app) {
        eprintln!("[inpainter] failed to sign out: {err}");
    }
    show_main_window(app);
}

// WebKitGTK on Linux occasionally finishes the window/compositor handshake
// before the page's JS has actually mounted into #root, leaving a permanently
// blank webview (seen in `pnpm dev`, loading the live Vite server over HTTP).
// Poll for an empty #root shortly after boot and force a reload if so. This
// mirrors the same guard already proven in the tray app's desktop_windows.rs.
#[cfg(debug_assertions)]
fn guard_against_blank_webview(app: &tauri::AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        for _ in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(400));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(
                    "try { var r = document.getElementById('root'); if (r && !r.hasChildNodes()) { location.reload(); } } catch (e) {}",
                );
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AuthState::default())
        .manage(StudioHost::default())
        .manage(DevAuth::default())
        .invoke_handler(tauri::generate_handler![
            sign_in,
            get_auth_session,
            open_workspace,
            get_browser_shell,
            get_destination_content,
            get_settings,
            update_settings,
            create_workspace,
            add_workspace,
            remove_workspace,
            create_agent,
            get_user_home,
            get_workspaces_dir,
            reveal_folder,
            read_text_file,
        ])
        .setup(|app| {
            bootstrap::initialize_on_boot().map_err(|err| {
                Box::<dyn std::error::Error>::from(format!(
                    "failed to bootstrap application home: {err}"
                ))
            })?;
            app.state::<DevAuth>().ensure().map_err(|err| {
                Box::<dyn std::error::Error>::from(format!(
                    "failed to start local auth: {err}"
                ))
            })?;
            auth::load_session_on_boot(app.handle());
            let open = MenuItem::with_id(app, MENU_OPEN, "Open Inpainter", true, None::<&str>)?;
            let sign_out = MenuItem::with_id(app, MENU_SIGN_OUT, "Sign Out", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, MENU_QUIT, "Quit Application", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &sign_out, &quit])?;

            let _tray = TrayIconBuilder::with_id(TRAY_ICON_ID)
                .icon(load_tray_icon())
                .menu(&menu)
                .tooltip("Inpainter")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    MENU_OPEN => open_from_tray(app),
                    MENU_SIGN_OUT => sign_out_from_tray(app),
                    MENU_QUIT => {
                        shutdown_host_for_app(app);
                        shutdown_auth_for_app(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            #[cfg(debug_assertions)]
            guard_against_blank_webview(&app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                } else {
                    shutdown_host_for_app(app_handle);
                    shutdown_auth_for_app(app_handle);
                }
            }
        });
}
