use crate::world;

pub const CANVAS_W: u32 = world::MAP_W as u32 * world::TILE;
pub const CANVAS_H: u32 = world::MAP_H as u32 * world::TILE;

/// 原創程式化 12×16 像素角色（非抄襲既有 IP）。
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct CharacterId(pub &'static str);

pub const CHARACTERS: &[CharacterSprite] = &[
    CharacterSprite {
        id: "xiaozhu",
        name: "小竹",
        palette: Palette {
            skin: "#ffcc99",
            hair: "#4a3728",
            shirt: "#5bd45b",
            pants: "#3d5a3d",
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
        _ => "transparent",
    }
}

/// 簡化牌點陣；1=膚 2=髮 3=衣 4=褲 5=眼
pub fn pixel_grid(id: &str) -> &'static str {
    match id {
        "xiaolan" => "\
000222222000\
002222222200\
002255225200\
002222222200\
000033330000\
003333333300\
003333333300\
003333333300\
000044440000\
000044440000\
000444444000\
000444444000\
000044440000\
000044440000\
000444444000\
000000000000",
        "xiaofen" => "\
002222222200\
022222222220\
022255225220\
002222222200\
000033330000\
003333333300\
003333333300\
000033330000\
000044440000\
000044440000\
000444444000\
000444444000\
000044440000\
000044440000\
000444444000\
000000000000",
        _ => "\
000333333000\
003333333300\
003553355300\
003333333300\
000022220000\
000222222000\
000224422000\
000222222000\
000044440000\
000044440000\
000444444000\
000444444000\
000044440000\
000044440000\
000444444000\
000000000000",
    }
}

pub const PIX_W: usize = 12;
pub const PIX_H: usize = 16;
