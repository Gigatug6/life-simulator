//! Moteur de simulation de vie (WebAssembly, sans std, sans crate externe).
//! Phase 0 : « hello » — vérifie la chaîne Docker -> wasm -> worker.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

static mut TICKS: u32 = 0;

/// Version du protocole du moteur (incrémentée si le format mémoire change).
#[no_mangle]
pub extern "C" fn version() -> u32 {
    1
}

/// Avance la simulation d'un tick et renvoie le compteur total.
#[no_mangle]
pub extern "C" fn tick() -> u32 {
    unsafe {
        TICKS = TICKS.wrapping_add(1);
        TICKS
    }
}

#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_works() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn version_is_one() {
        assert_eq!(version(), 1);
    }
}
