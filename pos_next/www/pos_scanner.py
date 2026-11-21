# Copyright (c) 2026, POSNext contributors and contributors
# For license information, please see license.txt

import frappe

no_cache = 1


def get_context(context):
	"""Serve the mobile scanner recognition prototype at /pos-scanner."""
	context.no_cache = 1
	context.splash_image = False
	# Prototype is a static Vue build under public/pos_scanner; HTML is the shell.
	frappe.local.flags.show_sidebar = False
