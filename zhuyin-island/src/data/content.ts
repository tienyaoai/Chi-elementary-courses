import { ui } from "./ui.ts";

// {1} 是這個字的第二個讀音，用來標輕聲或破音。
// 例如「爸爸{1}」第二個爸讀輕聲，「睡覺{1}」的覺讀ㄐㄧㄠˋ。
// 「小朋友」要寫成「小少{1}朋友」，少才會讀ㄕㄠˋ。

export type Picture =
  | { kind: "emoji"; emoji: string }
  | { kind: "swatch"; color: string }
  | { kind: "digit"; digit: string };

export type QuizItem = {
  id: string;
  picture: Picture;
  ask: string;
  answer: string;
  options: readonly string[];
};

export type OrderItem = {
  id: string;
  emoji: string;
  chunks: readonly string[];
};

export type StoryQuestion = {
  ask: string;
  answer: string;
  options: readonly string[];
};

export type StoryItem = {
  id: string;
  title: string;
  emoji: string;
  lines: readonly string[];
  questions: readonly StoryQuestion[];
};

export type LessonCard = {
  id: string;
  word: string;
  emoji: string;
  sentence: string;
};

export type Theme = {
  id: string;
  title: string;
  cards: readonly LessonCard[];
};

export type MemoryPair = {
  id: string;
  word: string;
  emoji: string;
};

export type MemoryDeck = {
  id: string;
  title: string;
  pairs: readonly MemoryPair[];
};

const what = ui.askWhat;

export const quizItems: readonly QuizItem[] = [
  { id: "dog", picture: { kind: "emoji", emoji: "🐶" }, ask: what, answer: "小狗", options: ["小狗", "小貓", "小鳥", "小魚"] },
  { id: "cat", picture: { kind: "emoji", emoji: "🐱" }, ask: what, answer: "小貓", options: ["小貓", "小狗", "兔子{1}", "小蟲"] },
  { id: "bird", picture: { kind: "emoji", emoji: "🐦" }, ask: what, answer: "小鳥", options: ["小鳥", "小魚", "小狗", "花朵"] },
  { id: "fish", picture: { kind: "emoji", emoji: "🐟" }, ask: what, answer: "小魚", options: ["小魚", "小鳥", "小蟲", "小草"] },
  { id: "rabbit", picture: { kind: "emoji", emoji: "🐰" }, ask: what, answer: "兔子{1}", options: ["兔子{1}", "小狗", "小貓", "小馬"] },
  { id: "bug", picture: { kind: "emoji", emoji: "🐛" }, ask: what, answer: "小蟲", options: ["小蟲", "小鳥", "小魚", "花朵"] },
  { id: "flower", picture: { kind: "emoji", emoji: "🌸" }, ask: what, answer: "花朵", options: ["花朵", "小草", "大樹", "白雲"] },
  { id: "tree", picture: { kind: "emoji", emoji: "🌳" }, ask: what, answer: "大樹", options: ["大樹", "花朵", "高山", "大門"] },
  { id: "mountain", picture: { kind: "emoji", emoji: "⛰️" }, ask: what, answer: "高山", options: ["高山", "大海", "大樹", "白雲"] },
  { id: "sun", picture: { kind: "emoji", emoji: "☀️" }, ask: what, answer: "太陽", options: ["太陽", "月亮", "星星", "白雲"] },
  { id: "moon", picture: { kind: "emoji", emoji: "🌙" }, ask: what, answer: "月亮", options: ["月亮", "太陽", "星星", "下雨"] },
  { id: "star", picture: { kind: "emoji", emoji: "⭐" }, ask: what, answer: "星星", options: ["星星", "月亮", "太陽", "眼睛"] },
  { id: "cloud", picture: { kind: "emoji", emoji: "☁️" }, ask: what, answer: "白雲", options: ["白雲", "太陽", "高山", "大海"] },
  { id: "rain", picture: { kind: "emoji", emoji: "🌧️" }, ask: ui.askWeather, answer: "下雨", options: ["下雨", "出太陽", "下雪", "很多雲"] },
  { id: "book", picture: { kind: "emoji", emoji: "📖" }, ask: what, answer: "書本", options: ["書本", "鉛筆", "書包", "尺子{1}"] },
  { id: "pencil", picture: { kind: "emoji", emoji: "✏️" }, ask: what, answer: "鉛筆", options: ["鉛筆", "書本", "尺子{1}", "書包"] },
  { id: "school", picture: { kind: "emoji", emoji: "🏫" }, ask: ui.askWhere, answer: "學校", options: ["學校", "公園", "家裡", "商店"] },
  { id: "home", picture: { kind: "emoji", emoji: "🏠" }, ask: ui.askWhere, answer: "家", options: ["家", "學校", "公園", "商店"] },
  { id: "dad", picture: { kind: "emoji", emoji: "👨" }, ask: ui.askWho, answer: "爸爸{1}", options: ["爸爸{1}", "媽媽{1}", "哥哥{1}", "老師"] },
  { id: "mom", picture: { kind: "emoji", emoji: "👩" }, ask: ui.askWho, answer: "媽媽{1}", options: ["媽媽{1}", "爸爸{1}", "妹妹{1}", "老師"] },
  { id: "apple", picture: { kind: "emoji", emoji: "🍎" }, ask: what, answer: "蘋果", options: ["蘋果", "香蕉", "米飯", "牛奶"] },
  { id: "banana", picture: { kind: "emoji", emoji: "🍌" }, ask: what, answer: "香蕉", options: ["香蕉", "蘋果", "紅花", "月亮"] },
  { id: "rice", picture: { kind: "emoji", emoji: "🍚" }, ask: what, answer: "米飯", options: ["米飯", "牛奶", "蘋果", "清水"] },
  { id: "milk", picture: { kind: "emoji", emoji: "🥛" }, ask: what, answer: "牛奶", options: ["牛奶", "米飯", "清水", "香蕉"] },
  { id: "car", picture: { kind: "emoji", emoji: "🚗" }, ask: what, answer: "汽車", options: ["汽車", "火車", "飛機", "大門"] },
  { id: "door", picture: { kind: "emoji", emoji: "🚪" }, ask: what, answer: "大門", options: ["大門", "小窗", "汽車", "書本"] },
  { id: "hand", picture: { kind: "emoji", emoji: "✋" }, ask: what, answer: "小手", options: ["小手", "小腳", "眼睛", "嘴巴{1}"] },
  { id: "eye", picture: { kind: "emoji", emoji: "👀" }, ask: what, answer: "眼睛", options: ["眼睛", "小手", "耳朵{1}", "嘴巴{1}"] },
  { id: "red", picture: { kind: "swatch", color: "#ef4444" }, ask: ui.askColor, answer: "紅色", options: ["紅色", "黃色", "藍色", "白色"] },
  { id: "yellow", picture: { kind: "swatch", color: "#facc15" }, ask: ui.askColor, answer: "黃色", options: ["黃色", "紅色", "藍色", "黑色"] },
  { id: "blue", picture: { kind: "swatch", color: "#3b82f6" }, ask: ui.askColor, answer: "藍色", options: ["藍色", "綠色", "紅色", "白色"] },
  { id: "white", picture: { kind: "swatch", color: "#ffffff" }, ask: ui.askColor, answer: "白色", options: ["白色", "黑色", "黃色", "紅色"] },
  { id: "run", picture: { kind: "emoji", emoji: "🏃" }, ask: ui.askDoing, answer: "跑步", options: ["跑步", "走路", "游泳", "睡覺{1}"] },
  { id: "sleep", picture: { kind: "emoji", emoji: "😴" }, ask: ui.askDoing, answer: "睡覺{1}", options: ["睡覺{1}", "跑步", "吃飯", "看書"] },
  { id: "num3", picture: { kind: "digit", digit: "3" }, ask: ui.askNumber, answer: "三", options: ["三", "五", "八", "十"] },
  { id: "num5", picture: { kind: "digit", digit: "5" }, ask: ui.askNumber, answer: "五", options: ["五", "二", "四", "九"] },
  { id: "num8", picture: { kind: "digit", digit: "8" }, ask: ui.askNumber, answer: "八", options: ["八", "六", "三", "七"] },
];

export const orderItems: readonly OrderItem[] = [
  { id: "fly", emoji: "🐦", chunks: ["小鳥", "在", "天上", "飛"] },
  { id: "swim-fish", emoji: "🐟", chunks: ["小魚", "在", "水裡", "游"] },
  { id: "run-dog", emoji: "🐶", chunks: ["小狗", "喜歡", "跑步"] },
  { id: "bloom", emoji: "🌸", chunks: ["紅花", "開", "了"] },
  { id: "love", emoji: "👩", chunks: ["媽媽{1}", "愛", "我"] },
  { id: "eat", emoji: "🍎", chunks: ["我", "吃", "蘋果"] },
  { id: "sunrise", emoji: "☀️", chunks: ["太陽", "出來", "了"] },
  { id: "go-school", emoji: "🏫", chunks: ["我", "去", "學校"] },
  { id: "cat-sleep", emoji: "🐱", chunks: ["小貓", "在", "睡覺{1}"] },
  { id: "moon-round", emoji: "🌙", chunks: ["月亮", "好", "圓"] },
  { id: "dad-read", emoji: "👨", chunks: ["爸爸{1}", "在", "看", "書"] },
  { id: "one-bird", emoji: "👧", chunks: ["妹妹{1}", "有", "一隻", "小鳥"] },
  { id: "rain-day", emoji: "🌧️", chunks: ["今天", "下雨", "了"] },
  { id: "thanks", emoji: "🙏", chunks: ["我", "說", "謝謝{1}"] },
];

export const stories: readonly StoryItem[] = [
  {
    id: "white-dog",
    title: "小白",
    emoji: "🐶",
    lines: ["小美有一隻小狗。", "小狗是白色的。", "牠名叫小白。", "小白最喜歡跑步。"],
    questions: [
      { ask: "小白是什麼顏色？", answer: "白色", options: ["白色", "黑色", "紅色"] },
      { ask: "小白最喜歡做什麼？", answer: "跑步", options: ["跑步", "游泳", "唱歌"] },
    ],
  },
  {
    id: "park",
    title: "去公園",
    emoji: "🌳",
    lines: ["今天天氣很好。", "弟弟{1}和妹妹{1}去公園。", "公園裡有紅花，也有大樹。", "他們在大樹下玩。"],
    questions: [
      {
        ask: "誰去公園？",
        answer: "弟弟{1}和妹妹{1}",
        options: ["弟弟{1}和妹妹{1}", "爸爸{1}和媽媽{1}", "老師和同學"],
      },
      { ask: "他們在哪裡玩？", answer: "大樹下", options: ["大樹下", "海水裡", "教室裡"] },
    ],
  },
  {
    id: "morning",
    title: "去上學",
    emoji: "🏫",
    lines: ["早上，媽媽{1}叫我起床。", "我先刷牙，再洗臉。", "然後我吃早餐。", "我背書包去上學。"],
    questions: [
      { ask: "早上誰叫我起床？", answer: "媽媽{1}", options: ["媽媽{1}", "爸爸{1}", "同學"] },
      { ask: "我背什麼去上學？", answer: "書包", options: ["書包", "皮球", "雨傘"] },
    ],
  },
  {
    id: "hungry-cat",
    title: "餓了的小貓",
    emoji: "🐱",
    lines: ["小貓肚子{1}餓了。", "牠看見一條小魚。", "小魚很快就游走了。", "小貓說：「我還要再找。」"],
    questions: [
      { ask: "小貓怎麼了？", answer: "肚子{1}餓了", options: ["肚子{1}餓了", "想睡覺{1}", "在唱歌"] },
      { ask: "小魚後來怎麼了？", answer: "游走了", options: ["游走了", "飛走了", "睡覺{1}了"] },
    ],
  },
];

export const themes: readonly Theme[] = [
  {
    id: "family",
    title: "家人",
    cards: [
      { id: "family-me", word: "我", emoji: "🙋", sentence: "我是小少{1}朋友。" },
      { id: "family-dad", word: "爸爸{1}", emoji: "👨", sentence: "爸爸{1}愛我。" },
      { id: "family-mom", word: "媽媽{1}", emoji: "👩", sentence: "媽媽{1}叫我起床。" },
      { id: "family-bro", word: "哥哥{1}", emoji: "👦", sentence: "哥哥{1}去學校。" },
      { id: "family-young", word: "弟弟{1}", emoji: "🧒", sentence: "弟弟{1}在看書。" },
      { id: "family-sis", word: "妹妹{1}", emoji: "👧", sentence: "妹妹{1}有一隻兔子{1}。" },
    ],
  },
  {
    id: "school",
    title: "學校",
    cards: [
      { id: "school-teacher", word: "老師", emoji: "👩", sentence: "老師說早安。" },
      { id: "school-mate", word: "同學", emoji: "🧒", sentence: "同學和我一起玩。" },
      { id: "school-place", word: "學校", emoji: "🏫", sentence: "我去學校。" },
      { id: "school-book", word: "書本", emoji: "📖", sentence: "我在看書。" },
      { id: "school-pen", word: "鉛筆", emoji: "✏️", sentence: "我用鉛筆寫字。" },
      { id: "school-bag", word: "書包", emoji: "🎒", sentence: "我背書包上學。" },
    ],
  },
  {
    id: "nature",
    title: "大自然",
    cards: [
      { id: "nature-sun", word: "太陽", emoji: "☀️", sentence: "太陽出來了。" },
      { id: "nature-moon", word: "月亮", emoji: "🌙", sentence: "月亮好圓。" },
      { id: "nature-star", word: "星星", emoji: "⭐", sentence: "天上有星星。" },
      { id: "nature-mountain", word: "高山", emoji: "⛰️", sentence: "那裡有高山。" },
      { id: "nature-flower", word: "花朵", emoji: "🌸", sentence: "紅花開了。" },
      { id: "nature-tree", word: "大樹", emoji: "🌳", sentence: "小鳥站在大樹上。" },
    ],
  },
  {
    id: "animal",
    title: "動物",
    cards: [
      { id: "animal-dog", word: "小狗", emoji: "🐶", sentence: "小狗喜歡跑步。" },
      { id: "animal-cat", word: "小貓", emoji: "🐱", sentence: "小貓在睡覺{1}。" },
      { id: "animal-bird", word: "小鳥", emoji: "🐦", sentence: "小鳥在天上飛。" },
      { id: "animal-fish", word: "小魚", emoji: "🐟", sentence: "小魚在水裡游。" },
      { id: "animal-rabbit", word: "兔子{1}", emoji: "🐰", sentence: "兔子{1}有長耳朵{1}。" },
      { id: "animal-bug", word: "小蟲", emoji: "🐛", sentence: "小蟲在草裡。" },
    ],
  },
];

export const decks: readonly MemoryDeck[] = [
  {
    id: "animals",
    title: "動物",
    pairs: [
      { id: "dog", word: "小狗", emoji: "🐶" },
      { id: "cat", word: "小貓", emoji: "🐱" },
      { id: "bird", word: "小鳥", emoji: "🐦" },
      { id: "fish", word: "小魚", emoji: "🐟" },
      { id: "rabbit", word: "兔子{1}", emoji: "🐰" },
      { id: "bug", word: "小蟲", emoji: "🐛" },
    ],
  },
  {
    id: "nature",
    title: "大自然",
    pairs: [
      { id: "sun", word: "太陽", emoji: "☀️" },
      { id: "moon", word: "月亮", emoji: "🌙" },
      { id: "star", word: "星星", emoji: "⭐" },
      { id: "mountain", word: "高山", emoji: "⛰️" },
      { id: "flower", word: "花朵", emoji: "🌸" },
      { id: "tree", word: "大樹", emoji: "🌳" },
    ],
  },
  {
    id: "life",
    title: "生活",
    pairs: [
      { id: "book", word: "書本", emoji: "📖" },
      { id: "pen", word: "鉛筆", emoji: "✏️" },
      { id: "car", word: "汽車", emoji: "🚗" },
      { id: "door", word: "大門", emoji: "🚪" },
      { id: "school", word: "學校", emoji: "🏫" },
      { id: "rice", word: "米飯", emoji: "🍚" },
    ],
  },
];

export const cardTotal = themes.reduce((sum, theme) => sum + theme.cards.length, 0);
