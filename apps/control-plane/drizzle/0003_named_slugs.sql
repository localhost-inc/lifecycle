ALTER TABLE `repository` ADD `slug` text NOT NULL DEFAULT '';
ALTER TABLE `workspace` ADD `slug` text NOT NULL DEFAULT '';

WITH normalized_repository AS (
  SELECT
    `id`,
    `organization_id`,
    CASE
      WHEN trim(`name`) = '' THEN 'repository'
      ELSE trim(
        replace(
          replace(
            replace(
              replace(
                replace(lower(`name`), ' ', '-'),
                '_',
                '-'
              ),
              '/',
              '-'
            ),
            '.',
            '-'
          ),
          '--',
          '-'
        ),
        '-'
      )
    END AS `base_slug`,
    `created_at`
  FROM `repository`
),
ranked_repository AS (
  SELECT
    current.`id`,
    CASE WHEN current.`base_slug` = '' THEN 'repository' ELSE current.`base_slug` END AS `base_slug`,
    (
      SELECT COUNT(*)
      FROM normalized_repository earlier
      WHERE
        earlier.`organization_id` = current.`organization_id`
        AND (CASE WHEN earlier.`base_slug` = '' THEN 'repository' ELSE earlier.`base_slug` END) =
          (CASE WHEN current.`base_slug` = '' THEN 'repository' ELSE current.`base_slug` END)
        AND (
          earlier.`created_at` < current.`created_at`
          OR (earlier.`created_at` = current.`created_at` AND earlier.`id` <= current.`id`)
        )
    ) AS `slug_index`
  FROM normalized_repository current
)
UPDATE `repository`
SET `slug` = (
  SELECT CASE
    WHEN ranked_repository.`slug_index` = 1 THEN ranked_repository.`base_slug`
    ELSE ranked_repository.`base_slug` || '-' || ranked_repository.`slug_index`
  END
  FROM ranked_repository
  WHERE ranked_repository.`id` = `repository`.`id`
);
--> statement-breakpoint
WITH normalized_workspace AS (
  SELECT
    `id`,
    `repository_id`,
    CASE
      WHEN trim(`name`) = '' THEN 'workspace'
      ELSE trim(
        replace(
          replace(
            replace(
              replace(
                replace(lower(`name`), ' ', '-'),
                '_',
                '-'
              ),
              '/',
              '-'
            ),
            '.',
            '-'
          ),
          '--',
          '-'
        ),
        '-'
      )
    END AS `base_slug`,
    `created_at`
  FROM `workspace`
),
ranked_workspace AS (
  SELECT
    current.`id`,
    CASE WHEN current.`base_slug` = '' THEN 'workspace' ELSE current.`base_slug` END AS `base_slug`,
    (
      SELECT COUNT(*)
      FROM normalized_workspace earlier
      WHERE
        earlier.`repository_id` = current.`repository_id`
        AND (CASE WHEN earlier.`base_slug` = '' THEN 'workspace' ELSE earlier.`base_slug` END) =
          (CASE WHEN current.`base_slug` = '' THEN 'workspace' ELSE current.`base_slug` END)
        AND (
          earlier.`created_at` < current.`created_at`
          OR (earlier.`created_at` = current.`created_at` AND earlier.`id` <= current.`id`)
        )
    ) AS `slug_index`
  FROM normalized_workspace current
)
UPDATE `workspace`
SET `slug` = (
  SELECT CASE
    WHEN ranked_workspace.`slug_index` = 1 THEN ranked_workspace.`base_slug`
    ELSE ranked_workspace.`base_slug` || '-' || ranked_workspace.`slug_index`
  END
  FROM ranked_workspace
  WHERE ranked_workspace.`id` = `workspace`.`id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_org_slug_unique` ON `repository` (`organization_id`, `slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_repo_slug_unique` ON `workspace` (`repository_id`, `slug`);
