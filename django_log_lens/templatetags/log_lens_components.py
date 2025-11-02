from django import template

register = template.Library()


def register_component_tags(templates: list[str]):
    """
    Registers the given component templates as inclusion tags.
    """

    for template_path in templates:
        component_name = template_path.split("/")[-1].replace(".html", "")

        def make_func_with_context(template_path):
            def func(context, *args, **kwargs):
                return context
            func.__name__ = component_name
            return func

        register.inclusion_tag(template_path, takes_context=True)(make_func_with_context(template_path))


def get_template_files(dir_name: str) -> list[str]:
    """
    Returns a list of all component template files
    by scanning the 'templates/{dir_name}' directory.
    """
    import os

    base_dir = os.path.dirname(os.path.abspath(__file__))
    templates_dir = os.path.join(base_dir, "..", "templates", dir_name)

    template_files = []
    for filename in os.listdir(templates_dir):
        if filename.endswith(".html"):
            template_files.append(f"{dir_name}/{filename}")

    return template_files


def get_registered_components() -> list[str]:
    """
    Returns the globally registered component tags for testing purposes.
    """
    # todo test the behaviour
    return list(register.tags.keys())


component_templates = get_template_files("log_lens_components")
register_component_tags(component_templates)
