pub const TILE: u32 = 24;
pub const MAP_W: usize = 22;
pub const MAP_H: usize = 15;
pub const SPAWN_TILE: (usize, usize) = (4, 12);

/// 0 grass, 1 rock/wall, 2 path, 3 chinese, 4 english, 5 math, 6 tree, 7 water, 8 flower
pub const MAP: &[&str] = &[
    "7777777777777777777777",
    "7000000000000000000007",
    "7000000000000000000007",
    "7011111111221111111107",
    "7000000000000000000007",
    "7000006000880006000007",
    "7000222233000000000007",
    "7000200000004005000007",
    "7000200000004005000007",
    "7000200000000000000007",
    "7002222222200000000007",
    "7000206000000060000007",
    "7000200000000000000007",
    "7000000000000000000007",
    "7777777777777777777777",
];

pub fn tile_at(tx: i32, ty: i32) -> u8 {
    if tx < 0 || ty < 0 {
        return 1;
    }
    let tx = tx as usize;
    let ty = ty as usize;
    let row = MAP.get(ty).copied().unwrap_or("1");
    if tx >= row.len() {
        return 1;
    }
    let ch = row.as_bytes().get(tx).copied().unwrap_or(b'1');
    ch - b'0'
}

pub fn walkable(tx: i32, ty: i32) -> bool {
    matches!(tile_at(tx, ty), 0 | 2 | 3 | 4 | 5 | 8)
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Portal {
    Chinese,
    English,
    Math,
}

pub fn portal_at(tx: i32, ty: i32) -> Option<Portal> {
    match tile_at(tx, ty) {
        3 => Some(Portal::Chinese),
        4 => Some(Portal::English),
        5 => Some(Portal::Math),
        _ => None,
    }
}

pub const CHINESE_GATE: (i32, i32) = (8, 6);

pub struct GateLabel;

impl GateLabel {
    pub fn name(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "國語小屋",
            Portal::English => "英語燈塔",
            Portal::Math => "數學工坊",
        }
    }

    pub fn hint(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "站在橘色國語小屋前，按下方「進入國語關卡」",
            Portal::English | Portal::Math => "這裡還在蓋，稍後再來",
        }
    }
}
