use web_sys::CanvasRenderingContext2d;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ArtKind {
    Sun,
    MoonRain,
    MoonNight,
    Flower,
    Fish,
    Cow,
    Bear,
    Elephant,
    Box,
    Bed,
    Window,
    Boat,
    CloudRain,
    CarRed,
    CarBlue,
    Bus,
    Bird,
    BirdBranch,
    Chick,
    Dog,
    Cat,
    Rabbit,
    Goose,
    Frog,
    Butterfly,
    ButterflyFlower,
    Horse,
    Tree,
    Bamboo,
    Mountain,
    Mountains,
    Rice,
    Watermelon,
    Grass,
    Leaf,
    Pencil,
    Book,
    Lamp,
    Table,
    Door,
    Umbrella,
    RainUmbrella,
    House,
    Mouth,
    Nose,
    Hand,
    Ear,
    Tooth,
    Egg,
    Apple,
    Candy,
    Ball,
    Star,
    Shirt,
    Mom,
    RunBrush,
    Basket,
    Paper,
    Fire,
    Field,
    Backpack,
    Shoe,
    BrushTeeth,
    GenericOptions,
    Fallback,
}

pub fn art_supported(desc: &str) -> bool {
    classify(desc) != ArtKind::Fallback || desc.contains("圖")
}

pub fn draw_scene(ctx: &CanvasRenderingContext2d, desc: &str, w: f64, h: f64) {
    ctx.set_image_smoothing_enabled(false);
    ctx.set_fill_style(&"#e8f4ff".into());
    ctx.fill_rect(0.0, 0.0, w, h);
    let kind = classify(desc);
    match kind {
        ArtKind::Sun => draw_sun(ctx, w, h),
        ArtKind::MoonRain => draw_moon(ctx, w, h, false),
        ArtKind::MoonNight => draw_moon(ctx, w, h, true),
        ArtKind::Flower => draw_flower(ctx, w, h),
        ArtKind::Fish => draw_fish(ctx, w, h),
        ArtKind::Cow => draw_cow(ctx, w, h),
        ArtKind::Bear => draw_bear(ctx, w, h),
        ArtKind::Elephant => draw_elephant(ctx, w, h),
        ArtKind::Box => draw_box(ctx, w, h),
        ArtKind::Bed => draw_bed(ctx, w, h),
        ArtKind::Window => draw_window(ctx, w, h),
        ArtKind::Boat => draw_boat(ctx, w, h),
        ArtKind::CloudRain => draw_cloud_rain(ctx, w, h),
        ArtKind::CarRed => draw_car(ctx, w, h, "#e53e3e"),
        ArtKind::CarBlue => draw_car(ctx, w, h, "#3b82f6"),
        ArtKind::Bus => draw_bus(ctx, w, h),
        ArtKind::Bird => draw_bird(ctx, w, h, false),
        ArtKind::BirdBranch => draw_bird(ctx, w, h, true),
        ArtKind::Chick => draw_chick(ctx, w, h),
        ArtKind::Dog => draw_dog(ctx, w, h),
        ArtKind::Cat => draw_cat(ctx, w, h),
        ArtKind::Rabbit => draw_rabbit(ctx, w, h),
        ArtKind::Goose => draw_goose(ctx, w, h),
        ArtKind::Frog => draw_frog(ctx, w, h),
        ArtKind::Butterfly => draw_butterfly(ctx, w, h, false),
        ArtKind::ButterflyFlower => draw_butterfly(ctx, w, h, true),
        ArtKind::Horse => draw_horse(ctx, w, h),
        ArtKind::Tree => draw_tree(ctx, w, h),
        ArtKind::Bamboo => draw_bamboo(ctx, w, h),
        ArtKind::Mountain => draw_mountain(ctx, w, h, false),
        ArtKind::Mountains => draw_mountain(ctx, w, h, true),
        ArtKind::Rice => draw_bowl(ctx, w, h),
        ArtKind::Watermelon => draw_watermelon(ctx, w, h),
        ArtKind::Grass => draw_grass_patch(ctx, w, h),
        ArtKind::Leaf => draw_leaf(ctx, w, h),
        ArtKind::Pencil => draw_pencil(ctx, w, h),
        ArtKind::Book => draw_book(ctx, w, h),
        ArtKind::Lamp => draw_lamp(ctx, w, h),
        ArtKind::Table => draw_table(ctx, w, h),
        ArtKind::Door => draw_door(ctx, w, h),
        ArtKind::Umbrella => draw_umbrella(ctx, w, h, "#fbbf24"),
        ArtKind::RainUmbrella => draw_umbrella(ctx, w, h, "#22c55e"),
        ArtKind::House => draw_house(ctx, w, h),
        ArtKind::Mouth => draw_mouth(ctx, w, h),
        ArtKind::Nose => draw_nose(ctx, w, h),
        ArtKind::Hand => draw_hand(ctx, w, h),
        ArtKind::Ear => draw_ear(ctx, w, h),
        ArtKind::Tooth => draw_tooth(ctx, w, h),
        ArtKind::Egg => draw_egg(ctx, w, h),
        ArtKind::Apple => draw_apple(ctx, w, h),
        ArtKind::Candy => draw_candy(ctx, w, h),
        ArtKind::Ball => draw_ball(ctx, w, h),
        ArtKind::Star => draw_star(ctx, w, h),
        ArtKind::Shirt => draw_shirt(ctx, w, h),
        ArtKind::Mom => draw_mom(ctx, w, h),
        ArtKind::RunBrush => draw_runner(ctx, w, h, desc.contains("牙刷")),
        ArtKind::Basket => draw_basket(ctx, w, h),
        ArtKind::Paper => draw_paper(ctx, w, h),
        ArtKind::Fire => draw_fire(ctx, w, h),
        ArtKind::Field => draw_field(ctx, w, h),
        ArtKind::Backpack => draw_backpack(ctx, w, h),
        ArtKind::Shoe => draw_shoe(ctx, w, h),
        ArtKind::BrushTeeth => draw_runner(ctx, w, h, true),
        ArtKind::GenericOptions => draw_generic(ctx, w, h),
        ArtKind::Fallback => draw_generic(ctx, w, h),
    }
}

fn classify(desc: &str) -> ArtKind {
    if desc.contains("三張選項") {
        return ArtKind::GenericOptions;
    }
    if desc.contains("杯子") {
        return ArtKind::Rice;
    }
    if desc.contains("牙刷") {
        return ArtKind::BrushTeeth;
    }
    if desc.contains("跑步") {
        return ArtKind::RunBrush;
    }
    if desc.contains("媽媽") {
        return ArtKind::Mom;
    }
    if desc.contains("上衣") {
        return ArtKind::Shirt;
    }
    if desc.contains("書包") {
        return ArtKind::Backpack;
    }
    if desc.contains("布鞋") {
        return ArtKind::Shoe;
    }
    if desc.contains("稻田") {
        return ArtKind::Field;
    }
    if desc.contains("營火") {
        return ArtKind::Fire;
    }
    if desc.contains("籃子") {
        return ArtKind::Basket;
    }
    if desc.contains("白紙") {
        return ArtKind::Paper;
    }
    if desc.contains("星星") {
        return ArtKind::Star;
    }
    if desc.contains("皮球") {
        return ArtKind::Ball;
    }
    if desc.contains("糖果") {
        return ArtKind::Candy;
    }
    if desc.contains("蘋果") {
        return ArtKind::Apple;
    }
    if desc.contains("雞蛋") {
        return ArtKind::Egg;
    }
    if desc.contains("牙齒") {
        return ArtKind::Tooth;
    }
    if desc.contains("耳朵") {
        return ArtKind::Ear;
    }
    if desc.contains("手") {
        return ArtKind::Hand;
    }
    if desc.contains("鼻子") {
        return ArtKind::Nose;
    }
    if desc.contains("嘴巴") {
        return ArtKind::Mouth;
    }
    if desc.contains("木屋") || desc.contains("小木") {
        return ArtKind::House;
    }
    if desc.contains("雨傘") || desc.contains("傘") {
        return if desc.contains("黃") {
            ArtKind::Umbrella
        } else {
            ArtKind::RainUmbrella
        };
    }
    if desc.contains("門") {
        return ArtKind::Door;
    }
    if desc.contains("桌子") {
        return ArtKind::Table;
    }
    if desc.contains("檯燈") || desc.contains("燈") {
        return ArtKind::Lamp;
    }
    if desc.contains("書") {
        return ArtKind::Book;
    }
    if desc.contains("鉛筆") {
        return ArtKind::Pencil;
    }
    if desc.contains("葉子") {
        return ArtKind::Leaf;
    }
    if desc.contains("小草") {
        return ArtKind::Grass;
    }
    if desc.contains("西瓜") {
        return ArtKind::Watermelon;
    }
    if desc.contains("白飯") || desc.contains("飯") {
        return ArtKind::Rice;
    }
    if desc.contains("三座") {
        return ArtKind::Mountains;
    }
    if desc.contains("山") {
        return ArtKind::Mountain;
    }
    if desc.contains("竹子") {
        return ArtKind::Bamboo;
    }
    if desc.contains("大樹") || desc.contains("樹") {
        return ArtKind::Tree;
    }
    if desc.contains("馬") {
        return ArtKind::Horse;
    }
    if desc.contains("蝴蝶停") {
        return ArtKind::ButterflyFlower;
    }
    if desc.contains("蝴蝶") {
        return ArtKind::Butterfly;
    }
    if desc.contains("青蛙") {
        return ArtKind::Frog;
    }
    if desc.contains("大鵝") || desc.contains("鵝") {
        return ArtKind::Goose;
    }
    if desc.contains("兔子") {
        return ArtKind::Rabbit;
    }
    if desc.contains("小貓") || desc.contains("貓") {
        return ArtKind::Cat;
    }
    if desc.contains("小狗") || desc.contains("狗") {
        return ArtKind::Dog;
    }
    if desc.contains("小雞") || desc.contains("雞") {
        return ArtKind::Chick;
    }
    if desc.contains("樹枝") || desc.contains("鳥") {
        return ArtKind::BirdBranch;
    }
    if desc.contains("公車") {
        return ArtKind::Bus;
    }
    if desc.contains("藍色汽車") || (desc.contains("藍") && desc.contains("汽車")) {
        return ArtKind::CarBlue;
    }
    if desc.contains("汽車") || desc.contains("小汽車") {
        return ArtKind::CarRed;
    }
    if desc.contains("下雨") {
        return ArtKind::CloudRain;
    }
    if desc.contains("船") || desc.contains("帆") {
        return ArtKind::Boat;
    }
    if desc.contains("窗") {
        return ArtKind::Window;
    }
    if desc.contains("床") {
        return ArtKind::Bed;
    }
    if desc.contains("箱子") {
        return ArtKind::Box;
    }
    if desc.contains("大象") {
        return ArtKind::Elephant;
    }
    if desc.contains("熊") {
        return ArtKind::Bear;
    }
    if desc.contains("牛") {
        return ArtKind::Cow;
    }
    if desc.contains("魚") {
        return ArtKind::Fish;
    }
    if desc.contains("花") {
        return ArtKind::Flower;
    }
    if desc.contains("夜空") || desc.contains("彎彎的月亮") {
        return ArtKind::MoonNight;
    }
    if desc.contains("月亮") {
        return ArtKind::MoonRain;
    }
    if desc.contains("太陽") {
        return ArtKind::Sun;
    }
    ArtKind::Fallback
}

fn px(ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, color: &str) {
    ctx.set_fill_style(&color.into());
    ctx.fill_rect(x, y, w, h);
}

fn draw_sun(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    let cx = w / 2.0;
    let cy = h * 0.42;
    px(ctx, cx - 28.0, cy - 28.0, 56.0, 56.0, "#fbbf24");
    px(ctx, cx - 22.0, cy - 22.0, 44.0, 44.0, "#fde047");
    for i in 0..8 {
        let a = i as f64 * std::f64::consts::PI / 4.0;
        let dx = a.cos() * 38.0;
        let dy = a.sin() * 38.0;
        px(ctx, cx + dx - 3.0, cy + dy - 3.0, 6.0, 6.0, "#f59e0b");
    }
}

fn draw_moon(ctx: &CanvasRenderingContext2d, w: f64, h: f64, night: bool) {
    if night {
        px(ctx, 0.0, 0.0, w, h, "#1e3a5f");
    }
    let cx = w / 2.0;
    let cy = h * 0.4;
    px(ctx, cx - 26.0, cy - 26.0, 52.0, 52.0, "#fef3c7");
    px(ctx, cx - 10.0, cy - 28.0, 40.0, 56.0, if night { "#1e3a5f" } else { "#e8f4ff" });
}

fn draw_flower(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    let cx = w / 2.0;
    let cy = h * 0.48;
    px(ctx, cx - 2.0, cy + 4.0, 4.0, 28.0, "#22c55e");
    for (dx, dy) in [(0.0, -14.0), (-14.0, 0.0), (14.0, 0.0), (-10.0, 10.0), (10.0, 10.0)] {
        px(ctx, cx + dx - 8.0, cy + dy - 8.0, 16.0, 16.0, "#f472b6");
    }
    px(ctx, cx - 8.0, cy - 8.0, 16.0, 16.0, "#fde047");
}

fn draw_fish(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    let cx = w / 2.0;
    let cy = h / 2.0;
    px(ctx, cx - 36.0, cy - 14.0, 60.0, 28.0, "#fb923c");
    px(ctx, cx + 20.0, cy - 12.0, 16.0, 24.0, "#ea580c");
    px(ctx, cx - 8.0, cy - 4.0, 6.0, 6.0, "#1e293b");
    px(ctx, cx - 30.0, cy + 10.0, 10.0, 6.0, "#ea580c");
}

fn draw_cow(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.25, h * 0.35, w * 0.5, h * 0.35, "#f8fafc");
    px(ctx, w * 0.32, h * 0.42, 12.0, 12.0, "#1e293b");
    px(ctx, w * 0.52, h * 0.42, 12.0, 12.0, "#1e293b");
    px(ctx, w * 0.42, h * 0.28, 16.0, 20.0, "#fce7f3");
    px(ctx, w * 0.54, h * 0.28, 16.0, 20.0, "#fce7f3");
}

fn draw_bear(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.35, h * 0.22, 16.0, 16.0, "#92400e");
    px(ctx, w * 0.52, h * 0.22, 16.0, 16.0, "#92400e");
    px(ctx, w * 0.32, h * 0.32, w * 0.38, h * 0.4, "#b45309");
    px(ctx, w * 0.46, h * 0.48, 10.0, 8.0, "#fde68a");
}

fn draw_elephant(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.3, w * 0.44, h * 0.38, "#9ca3af");
    px(ctx, w * 0.48, h * 0.55, 18.0, 28.0, "#9ca3af");
    px(ctx, w * 0.36, h * 0.38, 8.0, 8.0, "#1e293b");
    px(ctx, w * 0.5, h * 0.38, 8.0, 8.0, "#1e293b");
}

fn draw_box(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.28, w * 0.56, h * 0.5, "#d4a574");
    px(ctx, w * 0.26, h * 0.24, w * 0.48, 8.0, "#b8956a");
    px(ctx, w * 0.48, h * 0.42, 4.0, 16.0, "#78716c");
}

fn draw_bed(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.15, h * 0.5, w * 0.7, 24.0, "#92400e");
    px(ctx, w * 0.2, h * 0.32, w * 0.6, h * 0.22, "#60a5fa");
    px(ctx, w * 0.2, h * 0.28, w * 0.15, h * 0.08, "#fef3c7");
}

fn draw_window(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, "#93c5fd");
    px(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, "#1e293b");
    px(ctx, w * 0.22, h * 0.22, w * 0.56, h * 0.56, "#bae6fd");
    px(ctx, w * 0.48, h * 0.22, 4.0, h * 0.56, "#1e293b");
    px(ctx, w * 0.22, h * 0.48, w * 0.56, 4.0, "#1e293b");
}

fn draw_boat(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, 0.0, h * 0.72, w, h * 0.28, "#38bdf8");
    px(ctx, w * 0.18, h * 0.52, w * 0.64, 24.0, "#92400e");
    px(ctx, w * 0.48, h * 0.18, 6.0, h * 0.36, "#78716c");
    px(ctx, w * 0.5, h * 0.18, w * 0.3, h * 0.22, "#f87171");
}

fn draw_cloud_rain(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.2, h * 0.25, w * 0.6, 32.0, "#e2e8f0");
    px(ctx, w * 0.28, h * 0.22, w * 0.2, 20.0, "#e2e8f0");
    px(ctx, w * 0.48, h * 0.2, w * 0.28, 24.0, "#e2e8f0");
    for i in 0..4 {
        px(ctx, w * 0.32 + (i as f64 * 14.0), h * 0.58, 3.0, 14.0, "#3b82f6");
    }
}

fn draw_car(ctx: &CanvasRenderingContext2d, w: f64, h: f64, color: &str) {
    px(ctx, w * 0.15, h * 0.45, w * 0.7, 28.0, color);
    px(ctx, w * 0.28, h * 0.32, w * 0.35, 18.0, "#93c5fd");
    px(ctx, w * 0.22, h * 0.68, 16.0, 16.0, "#1e293b");
    px(ctx, w * 0.62, h * 0.68, 16.0, 16.0, "#1e293b");
}

fn draw_bus(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.1, h * 0.38, w * 0.8, 40.0, "#facc15");
    for i in 0..4 {
        px(ctx, w * 0.16 + (i as f64 * 18.0), h * 0.42, 12.0, 14.0, "#bae6fd");
    }
    px(ctx, w * 0.2, h * 0.72, 14.0, 14.0, "#1e293b");
    px(ctx, w * 0.68, h * 0.72, 14.0, 14.0, "#1e293b");
}

fn draw_bird(ctx: &CanvasRenderingContext2d, w: f64, h: f64, branch: bool) {
    if branch {
        px(ctx, w * 0.1, h * 0.55, w * 0.8, 8.0, "#92400e");
    }
    px(ctx, w * 0.38, h * 0.35, 28.0, 20.0, "#38bdf8");
    px(ctx, w * 0.58, h * 0.38, 14.0, 8.0, "#0ea5e9");
    px(ctx, w * 0.42, h * 0.4, 4.0, 4.0, "#1e293b");
}

fn draw_chick(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.32, h * 0.38, 36.0, 32.0, "#fde047");
    px(ctx, w * 0.46, h * 0.35, 12.0, 10.0, "#f97316");
    px(ctx, w * 0.4, h * 0.42, 4.0, 4.0, "#1e293b");
}

fn draw_dog(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.3, h * 0.4, 40.0, 30.0, "#eab308");
    px(ctx, w * 0.28, h * 0.32, 14.0, 22.0, "#ca8a04");
    px(ctx, w * 0.52, h * 0.32, 14.0, 22.0, "#ca8a04");
    px(ctx, w * 0.38, h * 0.44, 5.0, 5.0, "#1e293b");
}

fn draw_cat(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.32, h * 0.42, 38.0, 26.0, "#9ca3af");
    px(ctx, w * 0.34, h * 0.28, 10.0, 16.0, "#9ca3af");
    px(ctx, w * 0.52, h * 0.28, 10.0, 16.0, "#9ca3af");
    px(ctx, w * 0.4, h * 0.46, 4.0, 4.0, "#1e293b");
}

fn draw_rabbit(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.36, h * 0.48, 32.0, 28.0, "#f8fafc");
    px(ctx, w * 0.38, h * 0.22, 10.0, 28.0, "#f8fafc");
    px(ctx, w * 0.52, h * 0.22, 10.0, 28.0, "#f8fafc");
    px(ctx, w * 0.44, h * 0.52, 5.0, 5.0, "#1e293b");
}

fn draw_goose(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.4, 48.0, 32.0, "#f8fafc");
    px(ctx, w * 0.58, h * 0.38, 20.0, 12.0, "#f97316");
    px(ctx, w * 0.4, h * 0.44, 5.0, 5.0, "#1e293b");
}

fn draw_frog(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.42, 44.0, 28.0, "#22c55e");
    px(ctx, w * 0.32, h * 0.28, 16.0, 16.0, "#16a34a");
    px(ctx, w * 0.5, h * 0.28, 16.0, 16.0, "#16a34a");
    px(ctx, w * 0.36, h * 0.32, 8.0, 8.0, "#fef3c7");
    px(ctx, w * 0.54, h * 0.32, 8.0, 8.0, "#fef3c7");
}

fn draw_butterfly(ctx: &CanvasRenderingContext2d, w: f64, h: f64, with_flower: bool) {
    if with_flower {
        draw_flower(ctx, w, h);
    }
    let cx = w / 2.0;
    let cy = h * (if with_flower { 0.28 } else { 0.45 });
    px(ctx, cx - 2.0, cy - 8.0, 4.0, 20.0, "#1e293b");
    px(ctx, cx - 22.0, cy - 14.0, 20.0, 24.0, "#a855f7");
    px(ctx, cx + 4.0, cy - 14.0, 20.0, 24.0, "#ec4899");
}

fn draw_horse(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.25, h * 0.42, 50.0, 28.0, "#92400e");
    px(ctx, w * 0.3, h * 0.28, 20.0, 22.0, "#92400e");
    px(ctx, w * 0.58, h * 0.35, 12.0, 30.0, "#78350f");
}

fn draw_tree(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.46, h * 0.55, 14.0, h * 0.3, "#78350f");
    px(ctx, w * 0.28, h * 0.2, w * 0.44, h * 0.38, "#16a34a");
    px(ctx, w * 0.34, h * 0.15, w * 0.32, h * 0.2, "#22c55e");
}

fn draw_bamboo(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    for i in 0..3 {
        let x = w * 0.3 + (i as f64 * 18.0);
        px(ctx, x, h * 0.15, 10.0, h * 0.7, "#22c55e");
        px(ctx, x - 2.0, h * 0.35, 14.0, 4.0, "#15803d");
        px(ctx, x - 8.0, h * 0.5, 12.0, 6.0, "#4ade80");
    }
}

fn draw_mountain(ctx: &CanvasRenderingContext2d, w: f64, h: f64, triple: bool) {
    if triple {
        for (ox, sc) in [(0.08, 0.35), (0.38, 0.45), (0.62, 0.32)] {
            let bw = w * sc;
            px(ctx, w * ox, h * 0.72 - sc * h * 0.4, bw, sc * h * 0.4, "#4ade80");
            px(ctx, w * ox + bw * 0.35, h * 0.72 - sc * h * 0.55, bw * 0.3, sc * h * 0.2, "#f8fafc");
        }
    } else {
        px(ctx, w * 0.2, h * 0.45, w * 0.6, h * 0.35, "#22c55e");
        px(ctx, w * 0.42, h * 0.28, w * 0.2, h * 0.18, "#f8fafc");
    }
}

fn draw_bowl(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.45, w * 0.56, 28.0, "#e2e8f0");
    px(ctx, w * 0.26, h * 0.38, w * 0.48, 16.0, "#f8fafc");
    if w > 0.0 {
        px(ctx, w * 0.38, h * 0.3, 20.0, 14.0, "#3b82f6");
    }
}

fn draw_watermelon(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.38, w * 0.56, h * 0.38, "#16a34a");
    px(ctx, w * 0.26, h * 0.42, w * 0.48, h * 0.3, "#ef4444");
    for i in 0..5 {
        px(ctx, w * 0.3 + (i as f64 * 8.0), h * 0.48, 4.0, 12.0, "#fca5a5");
    }
}

fn draw_grass_patch(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, 0.0, h * 0.6, w, h * 0.4, "#4ade80");
    for i in 0..6 {
        px(ctx, w * 0.15 + (i as f64 * 12.0), h * 0.45, 4.0, 18.0, "#22c55e");
    }
}

fn draw_leaf(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.38, h * 0.25, 24.0, 48.0, "#22c55e");
    px(ctx, w * 0.48, h * 0.25, 4.0, 48.0, "#15803d");
}

fn draw_pencil(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.42, h * 0.15, 12.0, h * 0.7, "#fbbf24");
    px(ctx, w * 0.42, h * 0.12, 12.0, 12.0, "#fde68a");
    px(ctx, w * 0.44, h * 0.78, 8.0, 10.0, "#1e293b");
}

fn draw_book(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.25, w * 0.56, h * 0.5, "#3b82f6");
    px(ctx, w * 0.28, h * 0.32, w * 0.2, h * 0.35, "#f8fafc");
    px(ctx, w * 0.52, h * 0.32, w * 0.2, h * 0.35, "#e0f2fe");
}

fn draw_lamp(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.46, h * 0.52, 12.0, h * 0.28, "#78716c");
    px(ctx, w * 0.32, h * 0.22, w * 0.36, 32.0, "#fde047");
    px(ctx, w * 0.2, h * 0.1, w * 0.6, h * 0.5, "#fef9c380");
}

fn draw_table(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.12, h * 0.42, w * 0.76, 14.0, "#92400e");
    px(ctx, w * 0.18, h * 0.52, 10.0, h * 0.32, "#78350f");
    px(ctx, w * 0.72, h * 0.52, 10.0, h * 0.32, "#78350f");
}

fn draw_door(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.15, w * 0.44, h * 0.75, "#b45309");
    px(ctx, w * 0.58, h * 0.45, 8.0, 8.0, "#fbbf24");
}

fn draw_umbrella(ctx: &CanvasRenderingContext2d, w: f64, h: f64, color: &str) {
    px(ctx, w * 0.46, h * 0.35, 8.0, h * 0.45, "#78716c");
    px(ctx, w * 0.18, h * 0.28, w * 0.64, 28.0, color);
    px(ctx, w * 0.48, h * 0.78, 20.0, 6.0, "#78716c");
}

fn draw_house(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.2, h * 0.45, w * 0.6, h * 0.4, "#d4a574");
    px(ctx, w * 0.18, h * 0.22, w * 0.64, 28.0, "#ef4444");
    px(ctx, w * 0.42, h * 0.55, 16.0, 24.0, "#78350f");
}

fn draw_mouth(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.35, w * 0.56, h * 0.35, "#fecaca");
    px(ctx, w * 0.3, h * 0.55, w * 0.4, 16.0, "#f87171");
    px(ctx, w * 0.38, h * 0.58, w * 0.24, 8.0, "#fef2f2");
}

fn draw_nose(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.35, h * 0.32, w * 0.3, h * 0.35, "#fecaca");
    px(ctx, w * 0.46, h * 0.48, 12.0, 10.0, "#f9a8d4");
}

fn draw_hand(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.35, h * 0.5, 28.0, 32.0, "#fecaca");
    for i in 0..4 {
        px(ctx, w * 0.36 + (i as f64 * 7.0), h * 0.22, 6.0, 28.0, "#fecaca");
    }
    px(ctx, w * 0.58, h * 0.28, 6.0, 22.0, "#fecaca");
}

fn draw_ear(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.32, h * 0.28, 36.0, 48.0, "#fecaca");
    px(ctx, w * 0.38, h * 0.36, 22.0, 32.0, "#fda4af");
}

fn draw_tooth(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.38, h * 0.28, 28.0, 44.0, "#f8fafc");
    px(ctx, w * 0.42, h * 0.62, 20.0, 8.0, "#e2e8f0");
}

fn draw_egg(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.36, h * 0.28, 32.0, 44.0, "#f8fafc");
    px(ctx, w * 0.42, h * 0.35, 8.0, 8.0, "#e2e8f0");
}

fn draw_apple(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.32, h * 0.35, 40.0, 38.0, "#ef4444");
    px(ctx, w * 0.48, h * 0.28, 6.0, 12.0, "#78350f");
    px(ctx, w * 0.52, h * 0.26, 14.0, 10.0, "#22c55e");
}

fn draw_candy(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.38, h * 0.38, 28.0, 28.0, "#f472b6");
    px(ctx, w * 0.28, h * 0.42, 10.0, 18.0, "#fef3c7");
    px(ctx, w * 0.62, h * 0.42, 10.0, 18.0, "#fef3c7");
}

fn draw_ball(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.28, 48.0, 48.0, "#ef4444");
    px(ctx, w * 0.34, h * 0.34, 16.0, 16.0, "#fca5a5");
}

fn draw_star(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    let cx = w / 2.0;
    let cy = h / 2.0;
    px(ctx, cx - 24.0, cy - 24.0, 48.0, 48.0, "#fbbf24");
    px(ctx, cx - 6.0, cy - 32.0, 12.0, 64.0, "#fde047");
    px(ctx, cx - 32.0, cy - 6.0, 64.0, 12.0, "#fde047");
}

fn draw_shirt(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.38, w * 0.44, h * 0.4, "#3b82f6");
    px(ctx, w * 0.22, h * 0.32, w * 0.18, h * 0.12, "#2563eb");
    px(ctx, w * 0.6, h * 0.32, w * 0.18, h * 0.12, "#2563eb");
}

fn draw_mom(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.35, h * 0.22, 32.0, 32.0, "#fecaca");
    px(ctx, w * 0.38, h * 0.18, 26.0, 14.0, "#92400e");
    px(ctx, w * 0.32, h * 0.5, 38.0, 38.0, "#ec4899");
    px(ctx, w * 0.42, h * 0.42, 4.0, 4.0, "#1e293b");
    px(ctx, w * 0.54, h * 0.42, 4.0, 4.0, "#1e293b");
    px(ctx, w * 0.44, h * 0.52, 12.0, 6.0, "#f472b6");
}

fn draw_runner(ctx: &CanvasRenderingContext2d, w: f64, h: f64, brush: bool) {
    px(ctx, w * 0.38, h * 0.2, 20.0, 20.0, "#fecaca");
    px(ctx, w * 0.34, h * 0.36, 28.0, 32.0, "#60a5fa");
    px(ctx, w * 0.32, h * 0.62, 10.0, 22.0, "#1e293b");
    px(ctx, w * 0.52, h * 0.58, 12.0, 18.0, "#1e293b");
    if brush {
        px(ctx, w * 0.58, h * 0.32, 20.0, 8.0, "#22c55e");
        px(ctx, w * 0.72, h * 0.28, 8.0, 24.0, "#f8fafc");
    }
}

fn draw_basket(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.28, h * 0.4, w * 0.44, h * 0.35, "#d4a574");
    px(ctx, w * 0.3, h * 0.38, w * 0.4, 6.0, "#92400e");
    px(ctx, w * 0.38, h * 0.18, w * 0.24, 24.0, "#92400e");
}

fn draw_paper(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.25, h * 0.22, w * 0.5, h * 0.58, "#f8fafc");
    px(ctx, w * 0.3, h * 0.3, w * 0.35, 4.0, "#e2e8f0");
    px(ctx, w * 0.3, h * 0.38, w * 0.35, 4.0, "#e2e8f0");
}

fn draw_fire(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.38, h * 0.55, 24.0, 20.0, "#78350f");
    px(ctx, w * 0.32, h * 0.32, 36.0, 32.0, "#f97316");
    px(ctx, w * 0.38, h * 0.28, 24.0, 24.0, "#fde047");
}

fn draw_field(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, 0.0, h * 0.55, w, h * 0.45, "#ca8a04");
    for i in 0..5 {
        px(ctx, w * 0.12 + (i as f64 * 16.0), h * 0.42, 8.0, 14.0, "#eab308");
    }
}

fn draw_backpack(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.32, h * 0.28, 40.0, 48.0, "#22c55e");
    px(ctx, w * 0.36, h * 0.22, 12.0, 14.0, "#15803d");
    px(ctx, w * 0.52, h * 0.22, 12.0, 14.0, "#15803d");
    px(ctx, w * 0.38, h * 0.38, 28.0, 20.0, "#4ade80");
}

fn draw_shoe(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.22, h * 0.52, w * 0.56, 22.0, "#ef4444");
    px(ctx, w * 0.28, h * 0.38, 22.0, 22.0, "#ef4444");
}

fn draw_generic(ctx: &CanvasRenderingContext2d, w: f64, h: f64) {
    px(ctx, w * 0.2, h * 0.2, w * 0.6, h * 0.6, "#cbd5e1");
    px(ctx, w * 0.35, h * 0.38, w * 0.3, 8.0, "#94a3b8");
    px(ctx, w * 0.35, h * 0.5, w * 0.3, 8.0, "#94a3b8");
}
