use crate::components::PixelPicture;
use crate::grade1::Grade1Question;
use yew::prelude::*;

const SWATCH: &[(&str, &str)] = &[
    ("black", "#1a1a1a"),
    ("red", "#e53935"),
    ("blue", "#1e88e5"),
    ("yellow", "#fdd835"),
    ("green", "#43a047"),
    ("white", "#f5f5f5"),
    ("orange", "#fb8c00"),
    ("brown", "#6d4c41"),
];

pub fn question_has_prompt_visual(q: &Grade1Question) -> bool {
    q.clock.is_some()
        || q.shape.is_some()
        || q.color_swatch.is_some()
        || q.subtract.is_some()
        || q.add_groups.as_ref().is_some_and(|g| g.len() >= 2)
        || q.count.is_some_and(|c| c >= 2)
        || q.image.as_ref().is_some_and(|s| {
            let t = s.trim();
            !t.is_empty() && t != "三張選項圖"
        })
}

#[derive(Properties, PartialEq)]
pub struct QuestionVisualProps {
    pub question: Grade1Question,
}

#[function_component(QuestionVisual)]
pub fn question_visual(props: &QuestionVisualProps) -> Html {
    let q = &props.question;
    if let Some(cl) = &q.clock {
        return html! { <ClockFace hour={cl.hour} minute={cl.minute} /> };
    }
    if let Some(shape) = &q.shape {
        return html! { <ShapeView shape={shape.clone()} /> };
    }
    if let Some(color) = &q.color_swatch {
        return html! { <ColorSwatch name={color.clone()} /> };
    }
    if let (Some(sub), Some(img)) = (&q.subtract, &q.image) {
        return html! {
            <SubtractGrid description={img.clone()} from_n={sub.from} take_n={sub.take} />
        };
    }
    if let (Some(groups), Some(img)) = (&q.add_groups, &q.image) {
        if groups.len() >= 2 {
            return html! {
                <AddGroups description={img.clone()} left={groups[0]} right={groups[1]} />
            };
        }
    }
    let n = q.count.unwrap_or(1);
    if let Some(img) = &q.image {
        let t = img.trim();
        if t.is_empty() || t == "三張選項圖" {
            return html! {};
        }
        if n >= 2 {
            return html! { <CountGrid description={img.clone()} count={n} /> };
        }
        return html! { <PixelPicture description={img.clone()} large=true /> };
    }
    html! {}
}

#[derive(Properties, PartialEq)]
struct CountGridProps {
    description: String,
    count: u8,
}

#[function_component(CountGrid)]
fn count_grid(props: &CountGridProps) -> Html {
    let cols = if props.count > 5 { 5 } else { props.count };
    html! {
        <div class="q-visual count-grid" style={format!("--count-cols: {cols}")} data-count={props.count.to_string()}>
            { for (0..props.count).map(|i| html! {
                <div class="count-cell" key={i}>
                    <PixelPicture description={props.description.clone()} large=true />
                </div>
            })}
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct AddGroupsProps {
    description: String,
    left: u8,
    right: u8,
}

#[function_component(AddGroups)]
fn add_groups(props: &AddGroupsProps) -> Html {
    html! {
        <div class="q-visual add-groups">
            <div class="add-group add-group-left">
                { for (0..props.left).map(|i| html! {
                    <div class="count-cell" key={format!("L{i}")}>
                        <PixelPicture description={props.description.clone()} large=true />
                    </div>
                })}
            </div>
            <span class="add-groups-plus" aria-hidden="true">{"＋"}</span>
            <div class="add-group add-group-right">
                { for (0..props.right).map(|i| html! {
                    <div class="count-cell" key={format!("R{i}")}>
                        <PixelPicture description={props.description.clone()} large=true />
                    </div>
                })}
            </div>
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct SubtractGridProps {
    description: String,
    from_n: u8,
    take_n: u8,
}

#[function_component(SubtractGrid)]
fn subtract_grid(props: &SubtractGridProps) -> Html {
    html! {
        <div class="q-visual subtract-grid" data-from={props.from_n.to_string()} data-take={props.take_n.to_string()}>
            { for (0..props.from_n).map(|i| {
                let struck = i < props.take_n;
                html! {
                    <div class={classes!("count-cell", struck.then_some("subtract-taken"))} key={i}>
                        <PixelPicture description={props.description.clone()} large=true />
                    </div>
                }
            })}
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct ClockFaceProps {
    hour: u8,
    minute: u8,
}

#[function_component(ClockFace)]
fn clock_face(props: &ClockFaceProps) -> Html {
    let h = props.hour % 12;
    let hour_deg = (h as f32 + props.minute as f32 / 60.0) * 30.0;
    let minute_deg = props.minute as f32 * 6.0;
    html! {
        <div class="q-visual clock-face" role="img" aria-label={format!("{}點", props.hour)}>
            <svg class="clock-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <circle cx="60" cy="60" r="54" class="clock-dial" />
                { for (1..=12).map(|n| {
                    let a = (n as f32) * 30.0 - 90.0;
                    let rad = a.to_radians();
                    let x = 60.0 + 44.0 * rad.cos();
                    let y = 60.0 + 44.0 * rad.sin();
                    html! {
                        <text x={format!("{x:.1}")} y={format!("{y:.1}")} class="clock-num" text-anchor="middle" dominant-baseline="middle">{ n }</text>
                    }
                })}
                <line x1="60" y1="60" x2="60" y2="28" class="clock-hand clock-minute"
                    transform={format!("rotate({minute_deg} 60 60)")} />
                <line x1="60" y1="60" x2="60" y2="38" class="clock-hand clock-hour"
                    transform={format!("rotate({hour_deg} 60 60)")} />
                <circle cx="60" cy="60" r="4" class="clock-center" />
            </svg>
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct ShapeViewProps {
    shape: String,
}

#[function_component(ShapeView)]
fn shape_view(props: &ShapeViewProps) -> Html {
    let s = props.shape.as_str();
    html! {
        <div class="q-visual shape-view" data-shape={props.shape.clone()}>
            if s == "triangle" {
                <svg viewBox="0 0 120 100" class="shape-svg" role="img" aria-label="三角形">
                    <polygon points="60,8 112,92 8,92" class="shape-fill shape-triangle" />
                </svg>
            } else if s == "circle" {
                <svg viewBox="0 0 100 100" class="shape-svg"><circle cx="50" cy="50" r="44" class="shape-fill" /></svg>
            } else if s == "square" {
                <svg viewBox="0 0 100 100" class="shape-svg"><rect x="8" y="8" width="84" height="84" class="shape-fill" /></svg>
            } else if s == "star" {
                <svg viewBox="0 0 120 120" class="shape-svg">
                    <polygon points="60,5 77,45 120,50 87,78 96,120 60,98 24,120 33,78 0,50 43,45" class="shape-fill" />
                </svg>
            } else {
                <svg viewBox="0 0 120 80" class="shape-svg"><rect x="4" y="12" width="112" height="56" class="shape-fill" /></svg>
            }
        </div>
    }
}

#[derive(Properties, PartialEq)]
struct ColorSwatchProps {
    name: String,
}

#[function_component(ColorSwatch)]
fn color_swatch(props: &ColorSwatchProps) -> Html {
    let bg = SWATCH
        .iter()
        .find(|(k, _)| *k == props.name.as_str())
        .map(|(_, c)| *c)
        .unwrap_or("#888888");
    html! {
        <div class="q-visual color-swatch" style={format!("background-color: {bg}")} data-swatch={props.name.clone()} role="img" />
    }
}
