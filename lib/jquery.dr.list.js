/*
 * jQuery DR-List plugin
 * Plugin for jQuery to make AJAX table simple
 *
 * Copyright (C) 2011 Dmitry E. Oboukhov <unera@debian.org>
 * Copyright (C) 2011 Roman V. Nikolaev <rshadow@rambler.ru>
 *
 * Version: 0.1
 *
 * This program is free software, you can redistribute it and/or
 * modify it under the terms of the Artistic License.
*/

(function( $ ) {

    var defaults = {
        // Таблицы берется при привязкие плагина
        table:          null,
        // Элементы которые есть на странице
        filters:        '> thead > tr > th > form.filters:first',
        route:          '> thead > tr > th > form.filters input.route:first',
        loader:         '> thead > tr > th > form.filters img.loader:first',
        pager:          '> thead > tr > th > form.filters nav.pager:first',
        page:           '> thead > tr > th > form.filters input[name="page"]',
        // Элементы которые будут получены через AJAX запрос:
        // Селекторы данных. По данным селекторам элементы из таблицы будут
        // заменены элементами из AJAX запроса.
        // Можно использовать скаляр или массив.
        body:           ['tbody', 'tfoot'],
        // Селектор пейджера. Аналогично данным.
        pages:          'div.list_pager',

        // Другие параметры:

        // Таймаут для автоматического обновления списка
        timeout:        null,
        // Таймаут для автоматического обновления списка при ошибках
        errtimeout:     40000,
        // Дельта расброса для errtimeout. Сделана для снижения нагрузки
        // при массовых отвалах
        errdelta:       10000,
    };

    var tables = new Array();

    $.fn.drList = function( set ) {
        // Помержим опции с параметрами по умолчанию
        var opts = {};
        opts = $.extend(opts, defaults);
        opts = $.extend(opts, set);
        opts.table = this;
        // Сохраним в списке
        var index = tables.push( opts ) - 1;
        // После загрузки документа, загрузим список
        $(document).ready(function(){ LoadList(index) });

        // Возвратим сабы чтобы можно было подергать извне
        return {
            update:     function()          { UpdateList(index) },
            filters:    function( method )  { UpdateFilters(index, method) }
        };
    };

    function LoadList( index ) {
        var opts = tables[index];

        // Не работаем с фильтрами если не задан адрес для запросов.
        if(! $(opts.table).find(opts.route) )          { return; }
        if(! $(opts.table).find(opts.route).val() )    { return; }

        // Получим (или нет) все объекты
        opts.route   = $(opts.table).find(opts.route).val();
        opts.filters = $(opts.table).find(opts.filters);
        opts.inputs  = $(opts.filters).find(':input');
        opts.loader  = $(opts.table).find(opts.loader);
        opts.pager   = $(opts.table).find(opts.pager);
        opts.page    = $(opts.table).find(opts.page);

        // Селекторы преобразуем к массиву
        opts.body = $.isArray( opts.body ) ?opts.body :[opts.body];

        // Повесим обработчик на фильтры
        $(opts.inputs).change(function(){ UpdateList( index ) });

        // Восстановим значения фильтров
        UpdateFilters(index, 'get');

        // Первоначальное обновление списка
        UpdateList( index );

        // Если установлено время обновления то запустим таймер
        if( opts.timeout ) {
            window.setInterval(function(){
                UpdateList( index );
            }, opts.timeout);
        }
    }


    // Обновление списка
    function UpdateList( index ) {
        var opts = tables[index];

        // Не делаем повторного запроса если обновление уже идет
        if( $(opts.loader).css('display') != 'none' ) { return; }
        // Не обновляем если была ошибка. Обновлением занимается код обработки
        // ошибок.
        if( $(opts.loader).hasClass('error') ) { return; }

        // Сохраним значение фильтров
        UpdateFilters(index, 'set');

        // Получим сериализованные данные формы
        // (надо делать до отключения элементов)
        var strFormData = $(opts.filters).serialize();

        // Покажем лоадер
        $(opts.loader).show();

        // Отключим возможность фильтровать на время обновления
        $(opts.inputs).attr('disabled', true);

        // Делаем запрос за списком
        $.post(opts.route, strFormData,
            function( data ){
                var tmpTable = $('<table>').html(data);
                // Установим новые данные в таблицу
                $.each( opts.body, function(i, selector){
                    $(opts.table).find( selector ).remove();
                    $(opts.table).append($(tmpTable).find(selector).remove());
                });
                // Обновим данные пейджера
                $(opts.pager).html( $(tmpTable).find(opts.pages).remove() );
                // Выкинем мусор, оставшийся от передачи пейджера
                data = null;
                tmpTable = null;

                // Повесим обработчики на пейджер
                $(opts.pager).find(':button').click(function(){
                    $(opts.page).val( $(this).val() );
                    UpdateList(index);
                });

                // Включим фильтры
                $(opts.inputs).attr('disabled', false);
                // Скроем лоадер
                $(opts.loader).hide();

                // Вызовем постобработчик
                if (opts.ready && typeof(opts.ready) == 'function') {
                    opts.ready();
                }
            })
            .error(function(){
                // Добавим класс-флаг ошибки
                $(opts.loader).addClass('error');

                // Получим colspan
                var colspan = _column_count( $(opts.table) ) || 1;
                // Получим таймаут
                var timeout = Math.ceil(
                    (opts.errtimeout - Math.random() * opts.errdelta) / 1000 );

                // Куда выводим оставшееся время
                var objTimeout = $('<span/>').text(timeout);
                // Ячейка с выводом ошибки
                var objTd = $('<td/>')
                    .attr('colspan', colspan)
                    .append('Ошибка получения списка. ')
                    .append('Повторный запрос через ')
                    .append( objTimeout )
                    .append(' сек.');
                var objTr = $('<tr/>').append( objTd );
                var objTbody = $('<tbody class="error"/>')
                    .append( objTr );

                // Заменим tbody на сообщение об ошибке
                $.each( opts.body, function(i, selector){
                    $(opts.table).find( selector ).remove();
                });
                $(opts.table).append( objTbody );

                // Запустим таймер с отсчетом
                var intervalError = window.setInterval(function(){
                    timeout--;
                    objTimeout.text(timeout);
                    if(timeout <= 0) {
                        // Сбросим класс-флаг ошибки
                        $(opts.loader).removeClass('error');
                        // Обновим список
                        UpdateList(index);
                        // Очистим таймер
                        clearInterval( intervalError );
                        // Выводим сообщение
                        objTd.text('Подождите, список сейчас будет получен.');
                    }
                }, 1000);

                // Включим фильтры
                $(opts.inputs).attr('disabled', false);
                // Скроем лоадер
                $(opts.loader).hide();
            });
    }

    // Обновление фильтров
    // strMethod    - что мы хотим сделать:
    //      get - из хранилища обновить значения всем элементам
    //      set - из значений элементов записать в хранилище
    function UpdateFilters( index, strMethod ) {
        var opts = tables[index];

        // Проверим метод
        if( ! ( strMethod == 'get' || strMethod == 'set' ) ) {
            throw 'strMethod not "get" or "set"';
        }

        $.each($(opts.inputs), function(iIndex, objFilter) {
            // Пропустим вспомогательные элементы без имен
            if( $(objFilter).attr('name') == null ) { return; }

            // Определим строку ключа к хранилищу
            var strKey = 'filter:'+ opts.route +':'+ $(objFilter).attr('name');

            var strType = $(objFilter).attr('type');
            strType = (strType == null) ?$(objFilter).prop('type') :strType;

            // Разные методы восстановления значения для разных видов элементов
            switch ( strType ) {
            case "checkbox":
            case "radio":
                if( strMethod == 'get') {
                    // Пропустим не тот элемент
                    if ( $(objFilter).val() != $.jStorage.get(strKey, '') ) {
                        return;
                    }
                    $(objFilter).attr( 'checked', 'checked' );
                } else {
                    // Пропустим не выбранныей элемент
                    if ( ! $(objFilter).attr('checked') ) {
                        return;
                    }
                    $.jStorage.set(strKey,  $(objFilter).val()  );
                }
                break;
            case "select":
            case "select-one":
                if( strMethod == 'get') {
                    $(objFilter).find("option[value='"+$.jStorage.get(strKey, '')+"']")
                        .attr('selected','selected');
                } else {
                    $.jStorage.set(strKey,  $(objFilter).val()  );
                }
                break;
            default:
                if( strMethod == 'get') {
                    $(objFilter).val( $.jStorage.get(strKey, '') );
                } else {
                    $.jStorage.set(strKey,  $(objFilter).val()  );
                }
                break;
            }
        });
    }

    // Находит количество колонок для входящего объекта (table, thead, ...)
    function _column_count( obj ) {
        var count = 0;
        $(obj).find('tr:nth-child(1) td').each(function () {
            if ($(this).attr('colspan')) {
                count += +$(this).attr('colspan');
            } else {
                count++;
            }
        });
        return count;
    };

})( jQuery );
