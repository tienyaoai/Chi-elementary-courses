use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use web_sys::{Document, HtmlImageElement};

thread_local! {
    static LOADED: RefCell<HashSet<String>> = RefCell::new(HashSet::new());
    static DOC: RefCell<Option<Rc<Document>>> = RefCell::new(None);
}

fn document() -> Option<Rc<Document>> {
    DOC.with(|cell| {
        if cell.borrow().is_none() {
            let win = web_sys::window()?;
            let doc = win.document()?;
            *cell.borrow_mut() = Some(Rc::new(doc));
        }
        cell.borrow().clone()
    })
}

pub fn is_loaded(url: &str) -> bool {
    LOADED.with(|c| c.borrow().contains(url))
}

pub fn preload_url(url: String, on_ready: Option<yew::Callback<()>>) {
    if is_loaded(&url) {
        if let Some(cb) = on_ready {
            cb.emit(());
        }
        return;
    }
    let Some(doc) = document() else {
        return;
    };
    let img = doc.create_element("img").ok().and_then(|e| e.dyn_into::<HtmlImageElement>().ok());
    let Some(img) = img else {
        return;
    };
    img.set_decoding("async");
    let url_done = url.clone();
    let closure = Closure::once(move || {
        LOADED.with(|c| c.borrow_mut().insert(url_done));
        if let Some(cb) = on_ready {
            cb.emit(());
        }
    });
    img.set_onload(Some(closure.as_ref().unchecked_ref()));
    closure.forget();
    img.set_src(&url);
}

pub fn preload_urls(urls: impl IntoIterator<Item = String>) {
    for url in urls {
        preload_url(url, None);
    }
}
