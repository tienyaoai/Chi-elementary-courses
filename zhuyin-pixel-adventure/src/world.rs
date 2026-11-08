pub const TILE: u32 = 16;
pub const MAP_W: usize = 20;
pub const MAP_H: usize = 14;
pub const SPAWN_TILE: (usize, usize) = (3, 9);

/// 0 grass, 1 wall, 2 path, 3 chinese gate, 4 english, 5 math
pub const MAP: &[&str] = &[
    "11111111111111111111",
    "10000000022200000001",
    "10222222222222222001",
    "10201111111111102001",
    "10201000000000102001",
    "10201300004005002001",
    "10201000000000102001",
    "10201111111111102001",
    "10222222222222222001",
    "10000000022200000001",
    "11111111111111111111",
];

pub fn tile_at(tx: i32, ty: i32) -> u8 {
    if tx < 0 || ty < 0 {
        return 1;
    }
    let tx = tx as usize;
    let ty = ty as usize;
    let row = MAP.get(ty).copied().unwrap_or("1");
    let ch = row.as_bytes().get(tx).copied().unwrap_or(b'1');
    ch - b'0'
}

pub fn walkable(tx: i32, ty: i32) -> bool {
    let t = tile_at(tx, ty);
    t == 0 || t == 2 || t == 3 || t == 4 || t == 5
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

pub struct GateLabel;

impl GateLabel {
    pub fn name(p: Portal) -> &'static str {
        match p {
            Portal::Chinese => "國語關卡",
            Portal::English => "英語",
            Portal::Math => "數學",
        }
    }
}
