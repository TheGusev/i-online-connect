INSERT INTO demo_regions (id, center_city) VALUES
 ('ru-nso', 'Новосибирск'), ('ru-mow', 'Москва'),
 ('ru-kda', 'Краснодар'), ('ru-ba', 'Уфа')
ON CONFLICT (id) DO NOTHING;

INSERT INTO geo_places (id, city, normalized_name, region_id, source) VALUES
 ('ru-nso-novosibirsk', 'Новосибирск', 'новосибирск', 'ru-nso', 'initial-reviewed-directory'),
 ('ru-nso-kolyvan', 'Колывань', 'колывань', 'ru-nso', 'initial-reviewed-directory'),
 ('ru-mow-moscow', 'Москва', 'москва', 'ru-mow', 'initial-reviewed-directory'),
 ('ru-kda-krasnodar', 'Краснодар', 'краснодар', 'ru-kda', 'initial-reviewed-directory'),
 ('ru-kda-sochi', 'Сочи', 'сочи', 'ru-kda', 'initial-reviewed-directory'),
 ('ru-ba-ufa', 'Уфа', 'уфа', 'ru-ba', 'initial-reviewed-directory')
ON CONFLICT (id) DO NOTHING;

-- Exact unambiguous matches only; retain original profile text.
UPDATE profiles p SET geo_place_id = g.id
FROM geo_places g
WHERE p.geo_place_id IS NULL
  AND lower(trim(p.city)) = g.normalized_name
  AND (SELECT count(*) FROM geo_places x WHERE x.normalized_name = g.normalized_name) = 1;
UPDATE spaces s SET region_id = g.region_id
FROM geo_places g
WHERE s.region_id IS NULL AND lower(trim(s.city)) = g.normalized_name
  AND (SELECT count(*) FROM geo_places x WHERE x.normalized_name = g.normalized_name) = 1;
UPDATE listings l SET region_id = g.region_id
FROM geo_places g
WHERE l.region_id IS NULL AND lower(trim(l.city)) = g.normalized_name
  AND (SELECT count(*) FROM geo_places x WHERE x.normalized_name = g.normalized_name) = 1;
