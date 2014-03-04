from django.template                 import RequestContext
from django.shortcuts                import render_to_response

from manifold.core.query             import Query, AnalyzedQuery
from manifoldapi.manifoldapi         import execute_query

from django.views.generic.base      import TemplateView

from unfold.loginrequired           import LoginRequiredView
from django.http import HttpResponse
from django.shortcuts import render

from unfold.page                     import Page
from manifold.core.query             import Query, AnalyzedQuery
from manifoldapi.manifoldapi         import execute_query

from theme import ThemeView

class SliceResourceView (LoginRequiredView, ThemeView):
    template_name = "slice-resource-view.html"
    
    def get(self, request, slicename):
        if request.GET.get('message') : 
            msg = "Slice successfully updated"
        else :
            msg = None
        return render_to_response(self.template, {"msg" : msg, "slice": slicename, "theme": self.theme, "username": request.user, "section":"resources"}, context_instance=RequestContext(request))
