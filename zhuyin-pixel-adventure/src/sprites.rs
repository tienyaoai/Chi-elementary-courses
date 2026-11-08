use crate::world;

pub const CANVAS_W: u32 = world::MAP_W as u32 * world::TILE;
pub const CANVAS_H: u32 = world::MAP_H as u32 * world::TILE;
pub const PIX_W: usize = 14;
pub const PIX_H: usize = 18;
pub const PIXEL_SCALE: f64 = 2.0;

pub const CHARACTERS: &[CharacterSprite] = &[
    CharacterSprite {
        id: "xiaozhu",
        name: "小竹",
        palette: Palette {
            skin: "#ffcc99",
            hair: "#4a3728",
            shirt: "#5bd45b",
            pants: "#2d6b2d",
            accent: "#8fe88f",
        },
    },
    CharacterSprite {
        id: "xiaolan",
        name: "小藍",
        palette: Palette {
            skin: "#ffcc99",
            hair: "#1a2a4a",
            shirt: "#5c94fc",
            pants: "#2a4480",
            accent: "#9ec5ff",
        },
    },
    CharacterSprite {
        id: "xiaofen",
        name: "小粉",
        palette: Palette {
            skin: "#ffcc99",
            hair: "#8b3a62",
            shirt: "#ff8ac8",
            pants: "#c45a9a",
            accent: "#ffc4e8",
        },
    },
];

pub struct CharacterSprite {
    pub id: &'static str,
    pub name: &'static str,
    pub palette: Palette,
}

#[derive(Clone, Copy)]
pub struct Palette {
    pub skin: &'static str,
    pub hair: &'static str,
    pub shirt: &'static str,
    pub pants: &'static str,
    pub accent: &'static str,
}

pub fn find_character(id: &str) -> &'static CharacterSprite {
    CHARACTERS
        .iter()
        .find(|c| c.id == id)
        .unwrap_or(&CHARACTERS[0])
}

pub fn color_index(palette: &Palette, idx: u8) -> &'static str {
    match idx {
        1 => palette.skin,
        2 => palette.hair,
        3 => palette.shirt,
        4 => palette.pants,
        5 => "#1a1a1a",
        6 => palette.accent,
        _ => "transparent",
    }
}

/// frame 0/1 走路，walk_phase 用於擺動
pub fn pixel_grid(id: &str, frame: u8) -> &'static str {
    let bounce = frame % 2;
    match (id, bounce) {
        ("xiaolan", 0) => XIAOLAN_A,
        ("xiaolan", _) => XIAOLAN_B,
        ("xiaofen", 0) => XIAOFEN_A,
        ("xiaofen", _) => XIAOFEN_B,
        (_, 0) => XIAOZHU_A,
        (_, _) => XIAOZHU_B,
    }
}

const XIAOZHU_A: &str = concat!(
    "00033333333000", "00333333333000", "00355335533000", "00333333333000",
    "00002222222000", "00022662222000", "00022222222000", "00004444444000",
    "00004444444000", "00044444444400", "00044444444400", "00066000660000",
    "00044000440000", "00044444444400", "00000000000000", "00000000000000",
    "00000000000000", "00000000000000",
);

const XIAOZHU_B: &str = concat!(
    "00033333333000", "00333333333000", "00355335533000", "00333333333000",
    "00002222222000", "00022662222000", "00022222222000", "00004444444000",
    "00004444444000", "00044444444400", "00044444444400", "00055000550000",
    "00066000660000", "00044444444400", "00000000000000", "00000000000000",
    "00000000000000", "00000000000000",
);

const XIAOLAN_A: &str = concat!(
    "00022222222000", "00222222222200", "00225522522200", "00222222222200",
    "00003333333000", "00033663333000", "00033333333000", "00033333333000",
    "00004444444000", "00004444444000", "00044444444400", "00044444444400",
    "00066000660000", "00044000440000", "00044444444400", "00000000000000",
    "00000000000000", "00000000000000",
);

const XIAOLAN_B: &str = XIAOLAN_A;

const XIAOFEN_A: &str = concat!(
    "00222222222200", "02222222222220", "02225522522220", "00222222222200",
    "00003333333000", "00033333333000", "00033333333000", "00063333336000",
    "00004444444000", "00004444444000", "00044444444400", "00044444444400",
    "00055000550000", "00044444444400", "00000000000000", "00000000000000",
    "00000000000000", "00000000000000",
);

const XIAOFEN_B: &str = XIAOFEN_A;
