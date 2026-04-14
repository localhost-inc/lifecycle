#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DEV_RUNTIME_ROOT="${LIFECYCLE_RUNTIME_ROOT:-$("$REPO_ROOT/scripts/dev-runtime-root")}"
DEV_STATE_ROOT="${LIFECYCLE_DEV_STATE_ROOT:-$DEV_RUNTIME_ROOT/dev}"
RELOAD_SEQUENCE_FILE="$DEV_STATE_ROOT/desktop-mac-reload.seq"
LOCK_FILE="$DEV_STATE_ROOT/desktop-mac-reload.lock"

mkdir -p "$DEV_STATE_ROOT"

perl -e '
  use strict;
  use warnings;
  use Fcntl qw(:flock);

  my ($sequence_path, $lock_path) = @ARGV;

  open my $lock_fh, ">>", $lock_path or die "failed to open lock file: $!";
  flock($lock_fh, LOCK_EX) or die "failed to lock reload counter: $!";

  my $current = 0;
  if (open my $sequence_fh, "<", $sequence_path) {
    my $line = <$sequence_fh>;
    if (defined $line && $line =~ /(\d+)/) {
      $current = $1;
    }
    close $sequence_fh;
  }

  open my $out_fh, ">", $sequence_path or die "failed to write reload sequence: $!";
  print {$out_fh} ($current + 1), "\n" or die "failed to persist reload sequence: $!";
  close $out_fh or die "failed to close reload sequence: $!";
' "$RELOAD_SEQUENCE_FILE" "$LOCK_FILE"
