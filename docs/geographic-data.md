# Geographic directory

Source: [GeoNames](https://www.geonames.org/), country extract at https://download.geonames.org/export/dump/RU.zip.

GeoNames data is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Display the GeoNames attribution in the city-selection interface before releasing this feature.

The server downloads the public country extract without sending user profile data to GeoNames, at most once per seven days after a successful import. A failed refresh preserves existing directory rows. Only populated places with a Cyrillic name and a uniquely identified first-order administrative capital are imported. Duplicate settlement names within one region are skipped. The directory is not a guarantee of geographic accuracy or completeness; ambiguous names require explicit selection. Curated region IDs and existing records are retained.

Migration 042 must be applied after 040 and 041. Test the ZIP parser, import transaction and region matching against a disposable database before deployment. The current CI policy tests do not cover this importer. Local community-feed integration and UI are separate changes; this commit does not implement their display.
