export const ui = {
  title: "注注的國語島",
  subtitle: "一年級的注音冒險",
  intro1: "你好，我是注注。",
  intro2: "每個國字旁邊，都有注音。",
  intro3: "不會念的時候，按聽一聽。",
  gotIt: "我知道了",
  cardsTitle: "字卡小屋",
  cardsBlurb: "點一點，聽一聽，蓋一個印章。",
  quizTitle: "看圖找字",
  quizBlurb: "看圖，選出正確的詞語。",
  orderTitle: "句子排排",
  orderBlurb: "把詞語排成一句話。",
  memoryTitle: "翻翻記憶",
  memoryBlurb: "翻開卡片，把圖和國字配對。",
  storyTitle: "故事偵探",
  storyBlurb: "先讀故事，再回答問題。",
  back: "回島上",
  listen: "聽一聽",
  listenStory: "聽故事",
  readDone: "我讀好了",
  correct: "答對了！",
  tryAgain: "再想一想。",
  showAnswer: "看一看綠色的答案。",
  orderWrong: "順序還不一樣，再排一次。",
  orderEmpty: "按下面的詞語，排成一句話。",
  orderLeft: "還有詞語沒有排進去。",
  reveal: "看答案",
  check: "看看對不對",
  resetOrder: "重{1}新排",
  nextSentence: "下一句",
  nextQuestion: "下一題",
  seeStars: "看我的星星",
  again: "再玩一次",
  next: "下一關",
  memoryPick: "選一組卡片",
  memoryHint: "翻開兩張，找出圖和字。",
  matchOk: "配對成功！",
  matchNo: "這兩張不一樣。",
  readFirst: "先把故事讀一讀。",
  covered: "蓋住的卡片",
  picture: "圖畫",
  result3: "全部一次就過關。",
  result2: "你很用心。再玩一次，可以拿到三顆星。",
  result1: "你玩完這一關了。我們再看一次注音吧。",
  newBest: "這是新的最高紀錄。",
  themeDone: "這個主題的印章蓋滿了！",
  sentenceLabel: "造句",
  adultTitle: "給爸爸{1}媽媽{1}",
  adult1: "這是給國小一年級的國語練習。",
  adult2: "每個國字都用注音粉圓標上注音。",
  adult3: "句子裡的「一」和「不」，會跟著下一個字變調{1}。",
  adult4: "連詞「和」讀作ㄏㄜˊ。",
  adult5: "星星和印章只記在這台裝置裡，不會上傳。",
  adult6: "注音字型是注音粉圓，可以免費使用。",
  fontLink: "看字型的來源",
  clear: "清除這台裝置上的紀錄",
  cleared: "紀錄已經清除了。",
  loading: "注注正在準備注音",
  fontMissing: "注音字型還沒到，先看字旁邊的注音。",
  noVoice: "這台裝置沒有中文語音，可以請大人讀給你聽。",
  mute: "關閉音效",
  unmute: "開啟音效",
  askWhat: "這是什麼？",
  askWho: "這是誰？",
  askWhere: "這是哪裡？",
  askColor: "這是什麼顏色？",
  askDoing: "他在做什麼？",
  askNumber: "這是數字幾？",
  askWeather: "這是什麼天氣？",
} as const;

export function collectedLine(count: number): string {
  return `收集到的星星：${count}`;
}

export function stampCount(done: number, total: number): string {
  return `印章：${done}／${total}`;
}

export function askStep(current: number, total: number): string {
  return `第${current}題，共${total}題`;
}

export function storyStep(current: number, total: number): string {
  return `第${current}個故事，共${total}個`;
}

export function quizDetail(first: number, total: number): string {
  return `${total}題裡面，有${first}題一次就答對`;
}

export function memoryDetail(moves: number): string {
  return `這組卡片一共翻了${moves}次`;
}

export function starCount(count: number): string {
  return `${count}顆星`;
}
