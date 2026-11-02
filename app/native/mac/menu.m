// The tray menu on macOS, drawn here instead of by Electron so the "Layouts" section can be the
// panel the macOS app (2.6.1030) had: monitor rows and shape chips inside the menu. Electron menus
// hold only plain items. src/main/macMenu.ts describes the menu as JSON; this builds an NSMenu
// from it, shows it under the tray icon and returns the id of what was chosen.

#import <AppKit/AppKit.h>

static const CGFloat kMenuWidth = 300.0;
static const CGFloat kSideInset = 14.0;
static const CGFloat kTileRadius = 10.0;
static const CGFloat kChipColumns = 4.0;
static const CGFloat kPillFontSize = 10.0;
static const CGFloat kPillHorizontalPadding = 6.0;
static const CGFloat kPillHeight = 16.0;

#pragma mark - Pieces

static NSColor *DynamicColor(NSColor *light, NSColor *dark)
{
  return [NSColor colorWithName:nil dynamicProvider:^NSColor *(NSAppearance *appearance) {
    BOOL isDark = [appearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]] == NSAppearanceNameDarkAqua;
    return isDark ? dark : light;
  }];
}

static NSAttributedString *PillText(NSString *text)
{
  NSColor *color = DynamicColor([NSColor colorWithSRGBRed:0.60 green:0.29 blue:0.0 alpha:1.0],
                                [NSColor colorWithSRGBRed:1.0 green:0.81 blue:0.60 alpha:1.0]);
  return [[NSAttributedString alloc] initWithString:text
                                         attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:kPillFontSize weight:NSFontWeightBold],
                                                      NSForegroundColorAttributeName: color}];
}

/// The title followed by a small "Pro" pill, as the macOS app showed Split Pro items.
static NSAttributedString *TitleWithPill(NSString *title, NSString *pill)
{
  NSFont *font = [NSFont menuFontOfSize:0];
  NSSize size = NSMakeSize(ceil(PillText(pill).size.width) + 2 * kPillHorizontalPadding, kPillHeight);
  // Why: drawn when shown, so the pill follows the menu's light or dark look.
  NSImage *image = [NSImage imageWithSize:size flipped:NO drawingHandler:^BOOL(NSRect rect) {
    [DynamicColor([NSColor colorWithSRGBRed:1.0 green:0.91 blue:0.80 alpha:1.0],
                  [NSColor colorWithSRGBRed:0.35 green:0.23 blue:0.07 alpha:1.0]) setFill];
    [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:NSHeight(rect) / 2 yRadius:NSHeight(rect) / 2] fill];
    NSAttributedString *text = PillText(pill);
    NSSize textSize = text.size;
    [text drawAtPoint:NSMakePoint(NSMidX(rect) - textSize.width / 2, NSMidY(rect) - textSize.height / 2)];
    return YES;
  }];
  NSTextAttachment *attachment = [NSTextAttachment new];
  attachment.image = image;
  attachment.bounds = NSMakeRect(0, round((font.capHeight - size.height) / 2), size.width, size.height);
  NSMutableAttributedString *result = [[NSMutableAttributedString alloc] initWithString:[title stringByAppendingString:@"  "]
                                                                             attributes:@{NSFontAttributeName: font}];
  [result appendAttributedString:[NSAttributedString attributedStringWithAttachment:attachment]];
  return result;
}

static NSTextField *SectionLabel(NSString *text)
{
  NSTextField *label = [NSTextField labelWithString:text];
  label.font = [NSFont systemFontOfSize:11.0 weight:NSFontWeightSemibold];
  label.textColor = NSColor.secondaryLabelColor;
  return label;
}

/// A PNG drawn at twice the size it is shown at (Electron's toPNG of a menu picture).
static NSImage *ImageFromBase64(NSString *base64, BOOL template)
{
  if (base64.length == 0) {
    return nil;
  }
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  NSImage *image = data ? [[NSImage alloc] initWithData:data] : nil;
  NSImageRep *rep = image.representations.firstObject;
  if (!rep) {
    return nil;
  }
  image.size = NSMakeSize(rep.pixelsWide / 2.0, rep.pixelsHigh / 2.0);
  image.template = template;
  return image;
}

/// A small screen with filled (or, for "Auto", outlined) cells; `cells` are [x, y, width, height]
/// fractions, top-left based.
static NSImage *MiniScreenImage(NSArray<NSArray<NSNumber *> *> *cells, NSSize size, BOOL outlined)
{
  NSImage *image = [NSImage imageWithSize:size flipped:YES drawingHandler:^BOOL(NSRect dstRect) {
    NSRect screen = NSInsetRect(dstRect, 0.75, 0.75);
    NSBezierPath *outline = [NSBezierPath bezierPathWithRoundedRect:screen xRadius:2.5 yRadius:2.5];
    outline.lineWidth = 1.3;
    [[NSColor colorWithWhite:0 alpha:0.55] setStroke];
    [outline stroke];
    NSRect inner = NSInsetRect(screen, 2.0, 2.0);
    CGFloat inset = cells.count > 1 ? 0.6 : 0.4;
    for (NSArray<NSNumber *> *cell in cells) {
      if (cell.count != 4) {
        continue;
      }
      NSRect fill = NSMakeRect(NSMinX(inner) + cell[0].doubleValue * NSWidth(inner),
                               NSMinY(inner) + cell[1].doubleValue * NSHeight(inner),
                               cell[2].doubleValue * NSWidth(inner),
                               cell[3].doubleValue * NSHeight(inner));
      NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(fill, inset, inset) xRadius:1.2 yRadius:1.2];
      if (outlined) {
        // Inside the cell, so the outline keeps the same footprint as a filled cell.
        path = [NSBezierPath bezierPathWithRoundedRect:NSInsetRect(fill, inset + 0.5, inset + 0.5) xRadius:1.0 yRadius:1.0];
        path.lineWidth = 1.0;
        [[NSColor blackColor] setStroke];
        [path stroke];
      } else {
        [[NSColor blackColor] setFill];
        [path fill];
      }
    }
    return YES;
  }];
  image.template = YES;
  return image;
}

/// The key and modifiers of an Electron accelerator such as "Alt+Command+Left".
static BOOL ParseAccelerator(NSString *accelerator, NSString **key, NSEventModifierFlags *flags)
{
  NSArray<NSString *> *parts = [accelerator componentsSeparatedByString:@"+"];
  if (parts.count == 0) {
    return NO;
  }
  NSEventModifierFlags mask = 0;
  for (NSUInteger index = 0; index + 1 < parts.count; index++) {
    NSString *part = parts[index].lowercaseString;
    if ([part isEqualToString:@"command"] || [part isEqualToString:@"cmd"] || [part isEqualToString:@"commandorcontrol"]) {
      mask |= NSEventModifierFlagCommand;
    } else if ([part isEqualToString:@"control"] || [part isEqualToString:@"ctrl"]) {
      mask |= NSEventModifierFlagControl;
    } else if ([part isEqualToString:@"alt"] || [part isEqualToString:@"option"]) {
      mask |= NSEventModifierFlagOption;
    } else if ([part isEqualToString:@"shift"]) {
      mask |= NSEventModifierFlagShift;
    }
  }
  NSString *name = parts.lastObject;
  NSDictionary<NSString *, NSString *> *special = @{
    @"Left": [NSString stringWithFormat:@"%C", (unichar)NSLeftArrowFunctionKey],
    @"Right": [NSString stringWithFormat:@"%C", (unichar)NSRightArrowFunctionKey],
    @"Up": [NSString stringWithFormat:@"%C", (unichar)NSUpArrowFunctionKey],
    @"Down": [NSString stringWithFormat:@"%C", (unichar)NSDownArrowFunctionKey],
    @"Home": [NSString stringWithFormat:@"%C", (unichar)NSHomeFunctionKey],
    @"End": [NSString stringWithFormat:@"%C", (unichar)NSEndFunctionKey],
    @"PageUp": [NSString stringWithFormat:@"%C", (unichar)NSPageUpFunctionKey],
    @"PageDown": [NSString stringWithFormat:@"%C", (unichar)NSPageDownFunctionKey],
    @"Delete": [NSString stringWithFormat:@"%C", (unichar)NSDeleteFunctionKey],
    @"Insert": [NSString stringWithFormat:@"%C", (unichar)NSInsertFunctionKey],
    @"Backspace": [NSString stringWithFormat:@"%C", (unichar)NSBackspaceCharacter],
    @"Enter": @"\r",
    @"Tab": @"\t",
    @"Space": @" ",
  };
  NSString *character = special[name];
  NSInteger function = [name hasPrefix:@"F"] ? [name substringFromIndex:1].integerValue : 0;
  if (!character && function >= 1 && function <= 24) {
    character = [NSString stringWithFormat:@"%C", (unichar)(NSF1FunctionKey + function - 1)];
  }
  if (!character && name.length == 1) {
    character = name.lowercaseString;
  }
  if (!character) {
    return NO;
  }
  *key = character;
  *flags = mask;
  return YES;
}

#pragma mark - Layout panel

/// A row or chip in the panel: highlights under the mouse and when selected, and runs its block on
/// click. Plain controls in a menu do not get the menu's hover look by themselves.
@interface SplitMenuCell : NSControl
@property (nonatomic, assign) BOOL selected;
@property (nonatomic, copy) void (^clicked)(void);
@end

@implementation SplitMenuCell
{
  BOOL _hovering;
  NSTrackingArea *_tracking;
}

- (void)updateTrackingAreas
{
  [super updateTrackingAreas];
  if (_tracking) {
    [self removeTrackingArea:_tracking];
  }
  _tracking = [[NSTrackingArea alloc] initWithRect:self.bounds
                                           options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect
                                             owner:self
                                          userInfo:nil];
  [self addTrackingArea:_tracking];
}

- (void)mouseEntered:(NSEvent *)event
{
  _hovering = YES;
  self.needsDisplay = YES;
}

- (void)mouseExited:(NSEvent *)event
{
  _hovering = NO;
  self.needsDisplay = YES;
}

- (void)mouseUp:(NSEvent *)event
{
  if (self.clicked && NSPointInRect([self convertPoint:event.locationInWindow fromView:nil], self.bounds)) {
    self.clicked();
  }
}

- (void)setSelected:(BOOL)selected
{
  _selected = selected;
  self.needsDisplay = YES;
}

- (void)drawRect:(NSRect)dirtyRect
{
  if (!self.selected && !_hovering) {
    return;
  }
  NSColor *fill = self.selected ? [NSColor.controlAccentColor colorWithAlphaComponent:0.16]
                                : [NSColor.labelColor colorWithAlphaComponent:0.08];
  [fill setFill];
  [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:6.0 yRadius:6.0] fill];
}

@end

/// A rounded panel behind a group of rows, like the modules in Control Center.
@interface SplitMenuTile : NSView
@end

@implementation SplitMenuTile

- (void)drawRect:(NSRect)dirtyRect
{
  [[NSColor.labelColor colorWithAlphaComponent:0.06] setFill];
  [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:kTileRadius yRadius:kTileRadius] fill];
}

@end

/// Builds the panel from the "card" part of the JSON, and rebuilds it when another monitor is picked.
@interface SplitLayoutPanel : NSObject
- (instancetype)initWithCard:(NSDictionary *)card item:(NSMenuItem *)item chosen:(void (^)(NSString *))chosen;
@end

@implementation SplitLayoutPanel
{
  NSDictionary *_card;
  NSMenuItem *_item;
  void (^_chosen)(NSString *);
  NSString *_selectedID;
}

- (instancetype)initWithCard:(NSDictionary *)card item:(NSMenuItem *)item chosen:(void (^)(NSString *))chosen
{
  if (self = [super init]) {
    _card = card;
    _item = item;
    _chosen = [chosen copy];
    _selectedID = card[@"selected"];
    [self refresh];
  }
  return self;
}

- (NSDictionary *)selectedScreen
{
  for (NSDictionary *screen in _card[@"screens"]) {
    if ([screen[@"id"] isEqualToString:_selectedID]) {
      return screen;
    }
  }
  return [_card[@"screens"] firstObject];
}

- (void)refresh
{
  NSDictionary *selected = self.selectedScreen;
  _selectedID = selected[@"id"];

  NSStackView *content = [NSStackView stackViewWithViews:@[]];
  content.orientation = NSUserInterfaceLayoutOrientationVertical;
  content.alignment = NSLayoutAttributeLeading;
  content.spacing = 8.0;
  content.edgeInsets = NSEdgeInsetsMake(2.0, kSideInset - 4.0, 8.0, kSideInset - 4.0);

  // Monitors, one row each, like the Display module in Control Center. One monitor needs no choosing.
  NSArray<NSDictionary *> *screens = _card[@"screens"];
  if (screens.count > 1) {
    NSStackView *displays = [NSStackView stackViewWithViews:@[]];
    displays.orientation = NSUserInterfaceLayoutOrientationVertical;
    displays.alignment = NSLayoutAttributeLeading;
    displays.spacing = 2.0;
    for (NSDictionary *screen in screens) {
      NSView *row = [self rowForScreen:screen selected:screen == selected];
      [displays addArrangedSubview:row];
      [row.widthAnchor constraintEqualToAnchor:displays.widthAnchor].active = YES;
    }
    [content addArrangedSubview:[self tileWithTitle:_card[@"titles"][@"displays"] body:displays]];
  }

  // Shapes, then saved layouts, as chips. The chosen id carries the monitor after a tab.
  NSMutableArray<NSView *> *shapeChips = [NSMutableArray new];
  __weak typeof(self) weakSelf = self;
  for (NSDictionary *shape in _card[@"shapes"]) {
    BOOL automatic = [shape[@"auto"] boolValue];
    NSArray *cells = automatic ? selected[@"auto"] : shape[@"cells"];
    NSString *chosenID = [NSString stringWithFormat:@"%@\t%@", shape[@"id"], _selectedID];
    [shapeChips addObject:[self chipWithImage:MiniScreenImage(cells ?: @[], NSMakeSize(34.0, 22.0), automatic)
                                        title:shape[@"label"]
                                      toolTip:shape[@"toolTip"]
                                      clicked:^{ [weakSelf choose:chosenID]; }]];
  }
  NSStackView *tileBody = [NSStackView stackViewWithViews:@[[self chipGrid:shapeChips]]];
  tileBody.orientation = NSUserInterfaceLayoutOrientationVertical;
  tileBody.alignment = NSLayoutAttributeLeading;
  tileBody.spacing = 6.0;
  [tileBody addArrangedSubview:SectionLabel(_card[@"titles"][@"saved"])];
  NSArray<NSDictionary *> *saved = _card[@"saved"];
  if (saved.count == 0) {
    NSTextField *empty = [NSTextField wrappingLabelWithString:_card[@"empty"]];
    empty.font = [NSFont systemFontOfSize:11.0];
    empty.textColor = NSColor.secondaryLabelColor;
    empty.preferredMaxLayoutWidth = kMenuWidth - 2 * kSideInset - 16.0;
    [tileBody addArrangedSubview:empty];
  } else {
    NSMutableArray<NSView *> *savedChips = [NSMutableArray new];
    for (NSDictionary *layout in saved) {
      NSString *chosenID = layout[@"id"];
      [savedChips addObject:[self chipWithImage:MiniScreenImage(layout[@"cells"] ?: @[], NSMakeSize(34.0, 22.0), NO)
                                          title:layout[@"label"]
                                        toolTip:layout[@"toolTip"]
                                        clicked:^{ [weakSelf choose:chosenID]; }]];
    }
    [tileBody addArrangedSubview:[self chipGrid:savedChips]];
  }
  [content addArrangedSubview:[self tileWithTitle:_card[@"titles"][@"shapes"] body:tileBody]];

  NSView *container = [[NSView alloc] initWithFrame:NSZeroRect];
  content.translatesAutoresizingMaskIntoConstraints = NO;
  [container addSubview:content];
  [NSLayoutConstraint activateConstraints:@[
    [content.leadingAnchor constraintEqualToAnchor:container.leadingAnchor],
    [content.trailingAnchor constraintEqualToAnchor:container.trailingAnchor],
    [content.topAnchor constraintEqualToAnchor:container.topAnchor],
    [content.bottomAnchor constraintEqualToAnchor:container.bottomAnchor],
    [container.widthAnchor constraintEqualToConstant:kMenuWidth],
  ]];
  container.frame = NSMakeRect(0, 0, kMenuWidth, content.fittingSize.height);
  _item.view = container;
}

- (void)choose:(NSString *)chosenID
{
  _chosen(chosenID);
  [_item.menu cancelTracking];
}

- (NSView *)tileWithTitle:(NSString *)title body:(NSView *)body
{
  SplitMenuTile *tile = [SplitMenuTile new];
  NSStackView *stack = [NSStackView stackViewWithViews:@[SectionLabel(title), body]];
  stack.orientation = NSUserInterfaceLayoutOrientationVertical;
  stack.alignment = NSLayoutAttributeLeading;
  stack.spacing = 6.0;
  stack.edgeInsets = NSEdgeInsetsMake(8.0, 8.0, 8.0, 8.0);
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  [tile addSubview:stack];
  tile.translatesAutoresizingMaskIntoConstraints = NO;
  [NSLayoutConstraint activateConstraints:@[
    [stack.leadingAnchor constraintEqualToAnchor:tile.leadingAnchor],
    [stack.trailingAnchor constraintEqualToAnchor:tile.trailingAnchor],
    [stack.topAnchor constraintEqualToAnchor:tile.topAnchor],
    [stack.bottomAnchor constraintEqualToAnchor:tile.bottomAnchor],
    [tile.widthAnchor constraintEqualToConstant:kMenuWidth - 2 * (kSideInset - 4.0)],
    [body.widthAnchor constraintEqualToAnchor:stack.widthAnchor constant:-16.0],
  ]];
  return tile;
}

- (NSView *)rowForScreen:(NSDictionary *)screen selected:(BOOL)selected
{
  SplitMenuCell *row = [SplitMenuCell new];
  row.selected = selected;
  NSString *screenID = screen[@"id"];
  __weak typeof(self) weakSelf = self;
  row.clicked = ^{
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
      strongSelf->_selectedID = screenID;
      [strongSelf refresh];
    }
  };

  NSImageView *icon = [NSImageView imageViewWithImage:ImageFromBase64(_card[@"monitorImage"], YES) ?: [NSImage new]];
  icon.contentTintColor = selected ? NSColor.controlAccentColor : NSColor.secondaryLabelColor;
  NSTextField *name = [NSTextField labelWithString:screen[@"name"]];
  name.font = [NSFont systemFontOfSize:13.0];
  NSTextField *detail = [NSTextField labelWithString:screen[@"detail"]];
  detail.font = [NSFont systemFontOfSize:11.0];
  detail.textColor = NSColor.secondaryLabelColor;
  NSStackView *texts = [NSStackView stackViewWithViews:@[name, detail]];
  texts.orientation = NSUserInterfaceLayoutOrientationVertical;
  texts.alignment = NSLayoutAttributeLeading;
  texts.spacing = 0.0;
  NSMutableArray<NSView *> *views = [NSMutableArray arrayWithObjects:icon, texts, nil];
  if (selected) {
    NSImageView *check = [NSImageView imageViewWithImage:ImageFromBase64(_card[@"checkImage"], YES) ?: [NSImage new]];
    check.contentTintColor = NSColor.controlAccentColor;
    [views addObject:check];
  }
  NSStackView *line = [NSStackView stackViewWithViews:views];
  line.alignment = NSLayoutAttributeCenterY;
  line.distribution = NSStackViewDistributionFill;
  line.spacing = 8.0;
  [texts setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
  line.edgeInsets = NSEdgeInsetsMake(4.0, 6.0, 4.0, 6.0);
  [line setHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
  line.translatesAutoresizingMaskIntoConstraints = NO;
  [row addSubview:line];
  row.translatesAutoresizingMaskIntoConstraints = NO;
  [NSLayoutConstraint activateConstraints:@[
    [line.leadingAnchor constraintEqualToAnchor:row.leadingAnchor],
    [line.trailingAnchor constraintEqualToAnchor:row.trailingAnchor],
    [line.topAnchor constraintEqualToAnchor:row.topAnchor],
    [line.bottomAnchor constraintEqualToAnchor:row.bottomAnchor],
  ]];
  return row;
}

- (NSView *)chipWithImage:(NSImage *)image title:(NSString *)title toolTip:(NSString *)toolTip clicked:(void (^)(void))clicked
{
  SplitMenuCell *chip = [SplitMenuCell new];
  chip.clicked = clicked;
  chip.toolTip = [toolTip isKindOfClass:NSString.class] ? toolTip : nil;
  NSImageView *picture = [NSImageView imageViewWithImage:image];
  picture.contentTintColor = NSColor.labelColor;
  NSTextField *label = [NSTextField labelWithString:title];
  label.font = [NSFont systemFontOfSize:10.0];
  label.alignment = NSTextAlignmentCenter;
  label.lineBreakMode = NSLineBreakByTruncatingTail;
  NSStackView *stack = [NSStackView stackViewWithViews:@[picture, label]];
  stack.orientation = NSUserInterfaceLayoutOrientationVertical;
  stack.spacing = 3.0;
  stack.edgeInsets = NSEdgeInsetsMake(5.0, 2.0, 4.0, 2.0);
  stack.translatesAutoresizingMaskIntoConstraints = NO;
  [chip addSubview:stack];
  chip.translatesAutoresizingMaskIntoConstraints = NO;
  [NSLayoutConstraint activateConstraints:@[
    [stack.leadingAnchor constraintEqualToAnchor:chip.leadingAnchor],
    [stack.trailingAnchor constraintEqualToAnchor:chip.trailingAnchor],
    [stack.topAnchor constraintEqualToAnchor:chip.topAnchor],
    [stack.bottomAnchor constraintEqualToAnchor:chip.bottomAnchor],
    [label.widthAnchor constraintLessThanOrEqualToAnchor:chip.widthAnchor constant:-4.0],
  ]];
  return chip;
}

/// Chips in rows of four, all the same width.
- (NSView *)chipGrid:(NSArray<NSView *> *)chips
{
  NSGridView *grid = [NSGridView gridViewWithNumberOfColumns:(NSInteger)kChipColumns rows:0];
  grid.columnSpacing = 4.0;
  grid.rowSpacing = 4.0;
  for (NSUInteger start = 0; start < chips.count; start += (NSUInteger)kChipColumns) {
    NSMutableArray<NSView *> *row = [NSMutableArray new];
    for (NSUInteger index = start; index < start + (NSUInteger)kChipColumns; index++) {
      [row addObject:index < chips.count ? chips[index] : [NSGridCell emptyContentView]];
    }
    [grid addRowWithViews:row];
  }
  CGFloat columnWidth = (kMenuWidth - 2 * (kSideInset - 4.0) - 16.0 - 4.0 * (kChipColumns - 1)) / kChipColumns;
  for (NSInteger column = 0; column < grid.numberOfColumns; column++) {
    [grid columnAtIndex:column].width = columnWidth;
  }
  return grid;
}

@end

#pragma mark - The menu

/// Remembers which item was chosen; the menu items point at it.
@interface SplitMenuTarget : NSObject
@property (nonatomic, copy) NSString *chosen;
@property (nonatomic, strong) NSMutableArray *panels;
@end

@implementation SplitMenuTarget

- (void)choose:(NSMenuItem *)sender
{
  self.chosen = sender.representedObject;
}

@end

static NSMenu *BuildMenu(NSArray<NSDictionary *> *items, SplitMenuTarget *target)
{
  NSMenu *menu = [NSMenu new];
  menu.autoenablesItems = NO;
  for (NSDictionary *spec in items) {
    NSString *type = spec[@"type"];
    if ([type isEqualToString:@"separator"]) {
      [menu addItem:NSMenuItem.separatorItem];
      continue;
    }
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:spec[@"label"] ?: @"" action:nil keyEquivalent:@""];
    if ([type isEqualToString:@"header"]) {
      item.attributedTitle = [[NSAttributedString alloc] initWithString:item.title
                                                             attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:11.0 weight:NSFontWeightSemibold],
                                                                          NSForegroundColorAttributeName: NSColor.secondaryLabelColor}];
      item.enabled = NO;
      [menu addItem:item];
      continue;
    }
    if ([type isEqualToString:@"card"]) {
      [menu addItem:item];
      // Why: the target holds the panel, so the block must not hold the target back.
      __weak SplitMenuTarget *weakTarget = target;
      SplitLayoutPanel *panel = [[SplitLayoutPanel alloc] initWithCard:spec[@"card"]
                                                                 item:item
                                                               chosen:^(NSString *chosen) { weakTarget.chosen = chosen; }];
      [target.panels addObject:panel];
      continue;
    }
    item.image = ImageFromBase64(spec[@"image"], [spec[@"template"] boolValue]);
    if ([spec[@"pill"] isKindOfClass:NSString.class]) {
      item.attributedTitle = TitleWithPill(item.title, spec[@"pill"]);
    }
    if ([spec[@"toolTip"] isKindOfClass:NSString.class]) {
      item.toolTip = spec[@"toolTip"];
    }
    if ([spec[@"checked"] boolValue]) {
      item.state = NSControlStateValueOn;
    }
    NSString *key = nil;
    NSEventModifierFlags flags = 0;
    if ([spec[@"accelerator"] isKindOfClass:NSString.class] && ParseAccelerator(spec[@"accelerator"], &key, &flags)) {
      item.keyEquivalent = key;
      item.keyEquivalentModifierMask = flags;
    }
    if ([spec[@"submenu"] isKindOfClass:NSArray.class]) {
      item.submenu = BuildMenu(spec[@"submenu"], target);
    } else if ([spec[@"id"] isKindOfClass:NSString.class]) {
      item.target = target;
      item.action = @selector(choose:);
      item.representedObject = spec[@"id"];
    }
    item.enabled = spec[@"enabled"] ? [spec[@"enabled"] boolValue] : YES;
    [menu addItem:item];
  }
  return menu;
}

/// The status item's button under `point` (Cocoa screen coordinates), to show it pressed while the menu is open.
static NSButton *StatusButtonAt(NSPoint point)
{
  for (NSWindow *window in NSApp.windows) {
    if (![NSStringFromClass(window.class) isEqualToString:@"NSStatusBarWindow"] || !NSPointInRect(point, window.frame)) {
      continue;
    }
    NSMutableArray<NSView *> *views = [NSMutableArray arrayWithObject:window.contentView];
    while (views.count > 0) {
      NSView *view = views.firstObject;
      [views removeObjectAtIndex:0];
      if ([view isKindOfClass:NSButton.class]) {
        return (NSButton *)view;
      }
      [views addObjectsFromArray:view.subviews];
    }
  }
  return nil;
}

/// Shows the menu described by `json` with its top-left corner at (`x`, `y`): top-left based
/// screen points, the bottom-left corner of the tray icon. Returns the chosen id (malloc'd, the
/// caller frees it) or NULL when the menu closed without a choice.
char *split_pop_up_menu(const char *json, double x, double y)
{
  @autoreleasepool {
    NSData *data = [NSData dataWithBytes:json length:strlen(json)];
    NSArray *items = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![items isKindOfClass:NSArray.class]) {
      return NULL;
    }
    SplitMenuTarget *target = [SplitMenuTarget new];
    target.panels = [NSMutableArray new];
    NSMenu *menu = BuildMenu(items, target);
    CGFloat primaryHeight = NSMaxY(NSScreen.screens.firstObject.frame);
    NSPoint location = NSMakePoint(x, primaryHeight - y);
    NSButton *button = StatusButtonAt(NSMakePoint(x + 4.0, location.y + 4.0));
    [button highlight:YES];
    [menu popUpMenuPositioningItem:nil atLocation:location inView:nil];
    [button highlight:NO];
    return target.chosen ? strdup(target.chosen.UTF8String) : NULL;
  }
}
