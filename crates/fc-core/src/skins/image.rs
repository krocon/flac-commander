//! The little image handling the skin importer needs: reading Windows bitmaps, cutting pieces
//! out of them and writing those as PNG. No image library: BMP as classic skins use it is a
//! simple format, and PNG needs only the deflate that is in the tree already.

use flate2::Compression;
use flate2::write::ZlibEncoder;
use std::io::Write;

/// Largest bitmap side accepted (classic skin bitmaps are a few hundred pixels).
pub const MAX_SIDE: u32 = 4096;

/// A picture as rows of RGB pixels, top row first.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    /// `width × height × 3` bytes.
    rgb: Vec<u8>,
}

fn le16(bytes: &[u8], at: usize) -> Option<u32> {
    bytes.get(at..at + 2).map(|b| u32::from(u16::from_le_bytes([b[0], b[1]])))
}

fn le32(bytes: &[u8], at: usize) -> Option<u32> {
    bytes.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

impl Image {
    pub fn filled(width: u32, height: u32, rgb: [u8; 3]) -> Self {
        Self { width, height, rgb: rgb.repeat((width * height) as usize) }
    }

    pub fn pixel(&self, x: u32, y: u32) -> Option<[u8; 3]> {
        if x >= self.width || y >= self.height {
            return None;
        }
        let at = ((y * self.width + x) * 3) as usize;
        Some([self.rgb[at], self.rgb[at + 1], self.rgb[at + 2]])
    }

    pub fn set_pixel(&mut self, x: u32, y: u32, rgb: [u8; 3]) {
        if x < self.width && y < self.height {
            let at = ((y * self.width + x) * 3) as usize;
            self.rgb[at..at + 3].copy_from_slice(&rgb);
        }
    }

    /// Fills the part of the rectangle that lies inside the picture.
    pub fn fill(&mut self, x: u32, y: u32, width: u32, height: u32, rgb: [u8; 3]) {
        for row in y..y.saturating_add(height).min(self.height) {
            for column in x..x.saturating_add(width).min(self.width) {
                self.set_pixel(column, row, rgb);
            }
        }
    }

    /// The rectangle as a picture of its own; `None` if it is empty or not inside this one.
    pub fn crop(&self, x: u32, y: u32, width: u32, height: u32) -> Option<Self> {
        let inside = width > 0
            && height > 0
            && x.checked_add(width).is_some_and(|right| right <= self.width)
            && y.checked_add(height).is_some_and(|bottom| bottom <= self.height);
        if !inside {
            return None;
        }
        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        for row in y..y + height {
            let from = ((row * self.width + x) * 3) as usize;
            rgb.extend_from_slice(&self.rgb[from..from + (width * 3) as usize]);
        }
        Some(Self { width, height, rgb })
    }

    /// Reads an uncompressed Windows bitmap with 1, 4, 8 (palette), 24 or 32 bits per pixel.
    /// Compressed bitmaps and anything damaged give the reason as an error.
    pub fn from_bmp(bytes: &[u8]) -> Result<Self, String> {
        let short = || "the file is cut off".to_owned();
        if bytes.get(..2) != Some(b"BM") {
            return Err("not a Windows bitmap".to_owned());
        }
        let data_at = le32(bytes, 10).ok_or_else(short)? as usize;
        let header = le32(bytes, 14).ok_or_else(short)? as usize;
        if header < 40 {
            return Err(format!("bitmap header of {header} bytes is not supported"));
        }
        let width = le32(bytes, 18).ok_or_else(short)? as i32;
        let raw_height = le32(bytes, 22).ok_or_else(short)? as i32;
        let bits = le16(bytes, 28).ok_or_else(short)?;
        let compression = le32(bytes, 30).ok_or_else(short)?;
        // 3 = bit fields: accepted for 32 bits in the usual BGRA order
        if !(compression == 0 || (compression == 3 && bits == 32)) {
            return Err("compressed bitmaps are not supported".to_owned());
        }
        let top_down = raw_height < 0;
        let height = raw_height.unsigned_abs();
        if width <= 0 || height == 0 || width as u32 > MAX_SIDE || height > MAX_SIDE {
            return Err(format!("bitmap of {width} × {height} pixels"));
        }
        let width = width as u32;

        let palette: Vec<[u8; 3]> = if bits <= 8 {
            let declared = le32(bytes, 46).ok_or_else(short)? as usize;
            let colours = if declared == 0 { 1usize << bits } else { declared.min(256) };
            let at = 14 + header;
            (0..colours)
                .map(|i| bytes.get(at + i * 4..at + i * 4 + 3).map(|c| [c[2], c[1], c[0]]))
                .collect::<Option<_>>()
                .ok_or_else(short)?
        } else {
            Vec::new()
        };
        if !matches!(bits, 1 | 4 | 8 | 24 | 32) {
            return Err(format!("{bits} bits per pixel are not supported"));
        }

        // rows are padded to four bytes and stored bottom row first (unless the height is negative)
        let row_bytes = ((width as usize * bits as usize).div_ceil(32)) * 4;
        let mut rgb = vec![0u8; (width * height * 3) as usize];
        for row in 0..height as usize {
            let source_row = if top_down { row } else { height as usize - 1 - row };
            let at = data_at + source_row * row_bytes;
            let line = bytes.get(at..at + row_bytes).ok_or_else(short)?;
            for x in 0..width as usize {
                let colour = match bits {
                    24 => [line[x * 3 + 2], line[x * 3 + 1], line[x * 3]],
                    32 => [line[x * 4 + 2], line[x * 4 + 1], line[x * 4]],
                    _ => {
                        let index = match bits {
                            8 => line[x],
                            4 => (line[x / 2] >> (4 - 4 * (x % 2))) & 0x0F,
                            _ => (line[x / 8] >> (7 - x % 8)) & 0x01,
                        };
                        *palette.get(usize::from(index)).unwrap_or(&[0, 0, 0])
                    }
                };
                let out = (row * width as usize + x) * 3;
                rgb[out..out + 3].copy_from_slice(&colour);
            }
        }
        Ok(Self { width, height, rgb })
    }

    /// The picture as a PNG file (8-bit RGB).
    pub fn to_png(&self) -> Vec<u8> {
        fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
            out.extend((data.len() as u32).to_be_bytes());
            let mut crc = flate2::Crc::new();
            crc.update(kind);
            crc.update(data);
            out.extend(kind);
            out.extend(data);
            out.extend(crc.sum().to_be_bytes());
        }
        // every row starts with its filter type: 0, none
        let row = (self.width * 3) as usize;
        let mut raw = Vec::with_capacity((row + 1) * self.height as usize);
        for line in self.rgb.chunks(row) {
            raw.push(0);
            raw.extend_from_slice(line);
        }
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
        // writing into a Vec cannot fail
        let _ = encoder.write_all(&raw);
        let compressed = encoder.finish().unwrap_or_default();

        let mut header = Vec::with_capacity(13);
        header.extend(self.width.to_be_bytes());
        header.extend(self.height.to_be_bytes());
        header.extend([8, 2, 0, 0, 0]); // 8 bits, colour type 2 (RGB)

        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        chunk(&mut png, b"IHDR", &header);
        chunk(&mut png, b"IDAT", &compressed);
        chunk(&mut png, b"IEND", &[]);
        png
    }

    /// The picture as a 24-bit Windows bitmap (for tests and for building example skins).
    pub fn to_bmp(&self) -> Vec<u8> {
        let row_bytes = (self.width as usize * 3).div_ceil(4) * 4;
        let size = 54 + row_bytes * self.height as usize;
        let mut bmp = Vec::with_capacity(size);
        bmp.extend(b"BM");
        bmp.extend((size as u32).to_le_bytes());
        bmp.extend([0u8; 4]);
        bmp.extend(54u32.to_le_bytes());
        bmp.extend(40u32.to_le_bytes());
        bmp.extend(self.width.to_le_bytes());
        bmp.extend(self.height.to_le_bytes());
        bmp.extend(1u16.to_le_bytes());
        bmp.extend(24u16.to_le_bytes());
        bmp.extend([0u8; 24]);
        for row in (0..self.height).rev() {
            let from = (row * self.width * 3) as usize;
            for pixel in self.rgb[from..from + (self.width * 3) as usize].chunks(3) {
                bmp.extend([pixel[2], pixel[1], pixel[0]]);
            }
            bmp.resize(bmp.len() + row_bytes - self.width as usize * 3, 0);
        }
        bmp
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skins::manifest::image_size;
    use std::io::Read;

    /// A 5 × 3 picture with a different colour in every pixel.
    fn sample() -> Image {
        let mut image = Image::filled(5, 3, [0, 0, 0]);
        for y in 0..3 {
            for x in 0..5 {
                image.set_pixel(x, y, [(x * 50) as u8, (y * 100) as u8, (x + y * 5) as u8]);
            }
        }
        image
    }

    #[test]
    fn a_24_bit_bitmap_is_read_as_it_was_written() {
        let image = sample();
        assert_eq!(Image::from_bmp(&image.to_bmp()).unwrap(), image);
        // widths that need no padding, one, two and three bytes of it
        for width in 1..=8 {
            let image = Image::filled(width, 2, [10, 20, 30]);
            assert_eq!(Image::from_bmp(&image.to_bmp()).unwrap(), image, "width {width}");
        }
    }

    /// An 8-bit bitmap with a palette of two colours: 3 × 2, bottom row first.
    fn paletted() -> Vec<u8> {
        let mut bmp = b"BM".to_vec();
        bmp.extend([0u8; 8]);
        bmp.extend((54u32 + 8).to_le_bytes()); // pixel data after header and palette
        bmp.extend(40u32.to_le_bytes());
        bmp.extend(3u32.to_le_bytes());
        bmp.extend(2u32.to_le_bytes());
        bmp.extend(1u16.to_le_bytes());
        bmp.extend(8u16.to_le_bytes());
        bmp.extend([0u8; 16]);
        bmp.extend(2u32.to_le_bytes()); // colours used
        bmp.extend([0u8; 4]);
        bmp.extend([0, 0, 255, 0]); // colour 0: red (stored blue, green, red)
        bmp.extend([255, 0, 0, 0]); // colour 1: blue
        bmp.extend([1, 1, 1, 0]); // bottom row: blue, padded
        bmp.extend([0, 1, 0, 0]); // top row: red, blue, red
        bmp
    }

    #[test]
    fn a_bitmap_with_a_palette_is_read_bottom_row_first() {
        let image = Image::from_bmp(&paletted()).unwrap();
        assert_eq!((image.width, image.height), (3, 2));
        assert_eq!(image.pixel(0, 0), Some([255, 0, 0]));
        assert_eq!(image.pixel(1, 0), Some([0, 0, 255]));
        assert_eq!(image.pixel(2, 0), Some([255, 0, 0]));
        assert_eq!(image.pixel(0, 1), Some([0, 0, 255]));
    }

    #[test]
    fn broken_and_unsupported_bitmaps_give_a_reason() {
        assert!(Image::from_bmp(b"").is_err());
        assert!(Image::from_bmp(b"GIF89a").unwrap_err().contains("not a Windows bitmap"));
        let good = sample().to_bmp();
        assert!(Image::from_bmp(&good[..40]).unwrap_err().contains("cut off"));
        assert!(Image::from_bmp(&good[..good.len() - 5]).unwrap_err().contains("cut off"));

        let mut compressed = good.clone();
        compressed[30] = 1; // RLE8
        assert!(Image::from_bmp(&compressed).unwrap_err().contains("compressed"));
        let mut sixteen = good.clone();
        sixteen[28] = 16;
        assert!(Image::from_bmp(&sixteen).unwrap_err().contains("16 bits"));
        let mut huge = good.clone();
        huge[18..22].copy_from_slice(&100_000u32.to_le_bytes());
        assert!(Image::from_bmp(&huge).is_err());
        let mut empty = good;
        empty[22..26].copy_from_slice(&0u32.to_le_bytes());
        assert!(Image::from_bmp(&empty).is_err());
    }

    #[test]
    fn pieces_are_cut_out_only_where_the_picture_is() {
        let image = sample();
        let piece = image.crop(1, 1, 3, 2).unwrap();
        assert_eq!((piece.width, piece.height), (3, 2));
        assert_eq!(piece.pixel(0, 0), image.pixel(1, 1));
        assert_eq!(piece.pixel(2, 1), image.pixel(3, 2));
        assert_eq!(image.crop(0, 0, 5, 3).unwrap(), image);
        assert_eq!(image.crop(3, 0, 3, 1), None);
        assert_eq!(image.crop(0, 2, 1, 2), None);
        assert_eq!(image.crop(0, 0, 0, 1), None);
        assert_eq!(image.crop(u32::MAX, 0, 2, 1), None);
    }

    #[test]
    fn the_png_is_one_the_skin_validation_accepts_and_holds_the_pixels() {
        let image = sample();
        let png = image.to_png();
        assert_eq!(image_size(&png), Some((5, 3)));

        // unpack the IDAT chunk and compare the pixels
        let idat = png.windows(4).position(|w| w == b"IDAT").unwrap();
        let length = u32::from_be_bytes(png[idat - 4..idat].try_into().unwrap()) as usize;
        let mut raw = Vec::new();
        flate2::read::ZlibDecoder::new(&png[idat + 4..idat + 4 + length])
            .read_to_end(&mut raw)
            .unwrap();
        assert_eq!(raw.len(), 3 * (1 + 5 * 3));
        for y in 0..3u32 {
            let row = &raw[(y * 16) as usize..((y + 1) * 16) as usize];
            assert_eq!(row[0], 0, "filter type");
            for x in 0..5u32 {
                let at = (1 + x * 3) as usize;
                assert_eq!(Some([row[at], row[at + 1], row[at + 2]]), image.pixel(x, y));
            }
        }
    }

    #[test]
    fn filling_stays_inside_the_picture() {
        let mut image = Image::filled(4, 4, [0, 0, 0]);
        image.fill(2, 2, 10, 10, [9, 9, 9]);
        assert_eq!(image.pixel(1, 1), Some([0, 0, 0]));
        assert_eq!(image.pixel(3, 3), Some([9, 9, 9]));
        image.fill(u32::MAX, 0, 5, 5, [1, 1, 1]);
        assert_eq!(image.pixel(0, 0), Some([0, 0, 0]));
        assert_eq!(image.pixel(9, 9), None);
    }
}
