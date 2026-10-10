import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { cn } from "@/lib/utils";

export function ZoomablePhoto({
  src,
  alt = "Вложение",
  className,
  onZoomChange,
}: {
  src: string;
  alt?: string;
  className?: string;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  return (
    <TransformWrapper
      minScale={1}
      maxScale={4}
      centerOnInit
      limitToBounds
      doubleClick={{ mode: "toggle", step: 1.8 }}
      wheel={{ disabled: false, step: 0.12 }}
      panning={{ velocityDisabled: false }}
      onTransformed={(_ref, state) => onZoomChange?.(state.scale > 1.01)}
      onInit={() => onZoomChange?.(false)}
    >
      <TransformComponent
        wrapperClass="!h-full !w-full"
        contentClass="!flex !h-full !w-full !items-center !justify-center"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={cn("max-h-full max-w-full select-none object-contain", className)}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}