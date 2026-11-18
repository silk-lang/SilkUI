// The Metal Performance HUD on a window's CAMetalLayer (macOS 13 and later): the frame rate,
// frame times and GPU time Metal measures for what the layer actually presents.

#import <QuartzCore/QuartzCore.h>
#import <Foundation/Foundation.h>
#include <stdint.h>

static int32_t hud_default = 0;

void silk_ui_metal_hud_default(int32_t on) { hud_default = on; }

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
