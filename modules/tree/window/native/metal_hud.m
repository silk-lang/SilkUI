// The Metal Performance HUD on a window's CAMetalLayer (macOS 13 and later): the frame rate,
// frame times and GPU time Metal measures for what the layer actually presents. Metal draws it
// only when MTL_HUD_ENABLED was set before it started, so it is set as early as possible.

#import <QuartzCore/QuartzCore.h>
#import <Foundation/Foundation.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static int32_t hud_default = 0;

__attribute__((constructor)) static void silk_ui_metal_hud_from_environment(void) {
    const char *asked = getenv("SILK_UI_METAL_HUD");
    if (asked && asked[0] && strcmp(asked, "0") != 0) {
        setenv("MTL_HUD_ENABLED", "1", 1);
        hud_default = 1;
    }
}

void silk_ui_metal_hud_default(int32_t on) {
    hud_default = on;
    if (on) setenv("MTL_HUD_ENABLED", "1", 1);
}

int32_t silk_ui_metal_hud_default_on(void) { return hud_default; }

void silk_ui_metal_hud(void *layer, int32_t on) {
    if (!layer) return;
    CALayer *object = (__bridge CALayer *)layer;
    if (![object isKindOfClass:[CAMetalLayer class]]) return;
    CAMetalLayer *metal = (CAMetalLayer *)object;
    if (@available(macOS 13.0, *)) {
        NSDictionary *properties = on ? @{ @"mode" : @"default" } : nil;
        // Layer properties belong to the main thread, which runs AppKit.
        dispatch_async(dispatch_get_main_queue(), ^{ metal.developerHUDProperties = properties; });
    }
}
