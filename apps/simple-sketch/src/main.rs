use protocol::{AppMessage, ContentsKind, HostMessage, PanelSide};
use std::io::{BufRead, Write};

fn main() {
    {
        let mut stdout = std::io::stdout().lock();
        let declaration = [
            AppMessage::Hello {
                protocol: protocol::PROTOCOL_VERSION,
            },
            AppMessage::Tab {
                id: String::from("simple-sketch"),
                label: String::from("Simple Sketch"),
            },
            AppMessage::Contents {
                tab: String::from("simple-sketch"),
                kind: ContentsKind::Grid,
            },
            AppMessage::Panel {
                tab: String::from("simple-sketch"),
                side: PanelSide::Right,
            },
            AppMessage::End,
        ];
        for message in &declaration {
            let _ = stdout.write_all(protocol::encode_app_message(message).as_bytes());
        }
        let _ = stdout.flush();
    }

    let stdin = std::io::stdin();
    let input = stdin.lock();
    for line in input.lines() {
        let Ok(line) = line else {
            break;
        };
        if let Ok(HostMessage::Shutdown) = protocol::parse_host_message(&line) {
            break;
        }
    }
}
