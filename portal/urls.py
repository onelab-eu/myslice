# -*- coding: utf-8 -*-
#
# portal/urls.py: URL mappings for the portal application
# This file is part of the Manifold project.
#
# Authors:
#   Jordan Augé <jordan.auge@lip6.fr>
# Copyright 2013, UPMC Sorbonne Universités / LIP6
#
# This program is free software; you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation; either version 3, or (at your option) any later version.
# 
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
# details.
# 
# You should have received a copy of the GNU General Public License along with
# this program; see the file COPYING.  If not, write to the Free Software
# Foundation, 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA.

from django.views.generic.base   import TemplateView
from django.conf.urls           import patterns, include, url

from portal.views               import PresViewView, ValidatePendingView
from portal.views               import register_4m_f4f
from portal.platformsview       import PlatformsView
from portal.platformview        import PlatformView
from portal.dashboardview       import DashboardView
from portal.accountview         import AccountView, account_process
from portal.contactview         import ContactView
from portal.slicerequestview    import SliceRequestView


# DEPRECATED #named_register_forms = (
# DEPRECATED #    ("step1", RegisterUserForm),
# DEPRECATED #    ("step2", RegisterUserStep2Form)
# DEPRECATED #)
# DEPRECATED #
# DEPRECATED #register_wizard = RegisterUserWizardView.as_view(named_register_forms,
# DEPRECATED #    url_name="register_wizard_step")

urlpatterns = patterns('',
    # User registration
    #url(r'^user/register/?$', UserRegisterView.as_view(), name='user_register'),
    url(r'^user/register/complete/$',
        TemplateView.as_view(template_name='user_register_complete.html'),
        name='user_register_complete'),
    # User validation
    #url(r'^user/validate/?$', UserValidateView.as_view(), name='user_validate'),
    url(r'^dashboard/?$', DashboardView.as_view(), name='dashboard'),
    #url(r'^my_account/?$', MyAccountView.as_view(), name='my_account'),
    url(r'^account/?$', AccountView.as_view(), name='account'),
    url(r'^platforms/?$', PlatformsView.as_view(), name='platforms'),
    url(r'^platform/(?P<platformname>[\w\.]+)/?$', PlatformView.as_view(), name='platform'),
    url(r'^account/account_process/?$', account_process),
    url(r'^register/?$', register_4m_f4f),
    url(r'^contact/?$', ContactView.as_view(), name='contact'),
    # Slice request
    url(r'^slice_request/?$', SliceRequestView.as_view(), name='slice_request'),
    # Validate pending requests
    url(r'^validate/?$', ValidatePendingView.as_view()),
    # http://stackoverflow.com/questions/2360179/django-urls-how-to-pass-a-list-of-items-via-clean-urls
    # (r'^validate_action/(?P<constraints>[^/]+)/(?P<id>\w+)/?$', 'portal.views.pres_view_static'),
     (r'^validate_action(?P<id>(?:/\w+)+)/?$', 'portal.actions.validate_action'),

    url(r'^pres_view/?$', PresViewView.as_view(), name='pres_view'),
    (r'^methods/(?P<type>\w+)/?$', 'portal.views.pres_view_methods'),
    (r'^animation/(?P<constraints>[^/]+)/(?P<id>\w+)/?$', 'portal.views.pres_view_animation'),
    (r'^static/(?P<constraints>[^/]+)/(?P<id>\w+)/?$', 'portal.views.pres_view_static'),
    #url(r'^slice/request/?$',  views.slice_request,  name='slice_request'),
    # Slice confirmation
    #url(r'^slice/validate/?$', views.slice_validate, name='slice_validate'),
)
# (r'^accounts/', include('registration.backends.default.urls')),


# DEPRECATED #    url(r'^$', views.index, name='index'),
# DEPRECATED #    url(r"^registerwizard/(?P<step>[-\w]+)/$", register_wizard,
# DEPRECATED #        name="register_wizard_step"),
# DEPRECATED #    url(r"^registerwizard/$", register_wizard, name="register_wizard")
