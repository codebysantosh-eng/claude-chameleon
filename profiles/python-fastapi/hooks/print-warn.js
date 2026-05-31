#!/usr/bin/env node
/**
 * forge.python-fastapi.print-warn
 * Warns when print() is written to Python source files (not tests).
 */
require('../../../core/hooks/scripts/lib/print-warn').runPrintWarn({ loggers: 'structlog' });
