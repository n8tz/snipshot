<%@ page language="java" contentType="text/html; charset=UTF-8" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<html>
<body>
  <h1>Hello <%= request.getParameter("name") %></h1>
  <c:forEach var="item" items="${list}">
    <p>${item.label}</p>
  </c:forEach>
</body>
</html>
