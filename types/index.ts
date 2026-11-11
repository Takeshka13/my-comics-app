export type Shelf = {
  id: string;
  name: string;
  map_x: number;
  map_y: number;
  map_w: number;
  map_h: number;
};

export type Level = {
  id: string;
  shelf_id: string;
  position: number;
  width_mm: number;
  height_mm: number;
  depth_mm: number;
};